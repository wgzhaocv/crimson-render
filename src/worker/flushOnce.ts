import { redisClient } from "../lib/redis";
import { sql } from "../lib/db";
import { generateSnowflakeId } from "../lib/snowflake";
import {
  SHARE_VIEW_STREAM_KEY,
  VIEW_COUNT_DIRTY_DAYS_SET,
  VIEW_COUNT_DIRTY_TOTAL_SET,
  getDailyViewKey,
  getDailyUvHllKey,
  getDirtyDaySetKey,
  getTotalViewKey,
  yyyymmddToIsoDate,
} from "./redisKeys";

// Lua: 原子 get + del（兼容没有 GETDEL 的 Redis）
const LUA_GETDEL = `
local v = redis.call('GET', KEYS[1])
if v then
  redis.call('DEL', KEYS[1])
  return v
end
return false
`;

const ensureStreamGroup = async (group: string) => {
  try {
    // 从 0 开始消费；MKSTREAM：没有 stream 时自动创建
    await redisClient.xgroup("CREATE", SHARE_VIEW_STREAM_KEY, group, "0", "MKSTREAM");
  } catch (err) {
    // BUSYGROUP 表示已经存在，忽略即可
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) throw err;
  }
};

const getDelMany = async (keys: string[]): Promise<(string | null)[]> => {
  if (keys.length === 0) return [];
  const pipeline = redisClient.pipeline();
  for (const key of keys) {
    pipeline.eval(LUA_GETDEL, 1, key);
  }
  const results = await pipeline.exec();
  if (!results) return keys.map(() => null);
  return results.map(([err, value]) => {
    if (err) return null;
    if (value === false || value === null || value === undefined) return null;
    return String(value);
  });
};

const popSetBatch = async (key: string, count: number): Promise<string[]> => {
  // ioredis: SPOP key count -> string[] | null
  const popped = (await redisClient.spop(key, count)) as unknown;
  if (!popped) return [];
  if (Array.isArray(popped)) return popped.map(String);
  return [String(popped)];
};

const flushTotalViewCounts = async (batchSize: number): Promise<number> => {
  let updatedRows = 0;

  while (true) {
    const shareIds = await popSetBatch(VIEW_COUNT_DIRTY_TOTAL_SET, batchSize);
    if (shareIds.length === 0) break;

    const keys = shareIds.map(getTotalViewKey);
    const values = await getDelMany(keys);

    // 逐条更新 DB（清晰优先；批量可后续再优化）
    for (let i = 0; i < shareIds.length; i++) {
      const raw = values[i];
      const delta = raw ? Number.parseInt(raw, 10) : 0;
      if (!delta) continue;

      await sql`
        update share
        set view_count = view_count + ${delta}
        where id = ${shareIds[i]}::bigint
      `;
      updatedRows += 1;
    }
  }

  return updatedRows;
};

const flushDailyStats = async (batchSize: number): Promise<number> => {
  let updatedRows = 0;

  const days = (await redisClient.smembers(VIEW_COUNT_DIRTY_DAYS_SET)) ?? [];
  for (const day of days) {
    const daySetKey = getDirtyDaySetKey(day);
    const isoDate = yyyymmddToIsoDate(day);

    while (true) {
      const shareIds = await popSetBatch(daySetKey, batchSize);
      if (shareIds.length === 0) break;

      const keys = shareIds.map((shareId) => getDailyViewKey(shareId, day));
      const values = await getDelMany(keys);

      for (let i = 0; i < shareIds.length; i++) {
        const raw = values[i];
        const delta = raw ? Number.parseInt(raw, 10) : 0;
        if (!delta) continue;

        // unique_views：从 HyperLogLog 读取（近似 UV）
        const uvKey = getDailyUvHllKey(shareIds[i], day);
        const uv = Number(await redisClient.pfcount(uvKey));

        await sql`
          insert into share_daily_stat (share_id, stat_date, unique_views, total_views)
          values (${shareIds[i]}::bigint, ${isoDate}::date, ${uv}, ${delta})
          on conflict (share_id, stat_date)
          do update set
            total_views = share_daily_stat.total_views + excluded.total_views,
            unique_views = greatest(share_daily_stat.unique_views, excluded.unique_views)
        `;
        updatedRows += 1;
      }
    }

    // 当天处理完：如果 set 已空，移出 days 集合
    const remaining = await redisClient.scard(daySetKey);
    if (remaining === 0) {
      await redisClient.srem(VIEW_COUNT_DIRTY_DAYS_SET, day);
    }
  }

  return updatedRows;
};

type StreamEvent = {
  id: string; // stream entry id
  shareId: string;
  viewedAt: number;
  ipHash: string | null;
  userAgent: string | null;
  referer: string | null;
};

const parseStreamFields = (fields: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1] ?? "";
  }
  return result;
};

const consumeShareViewStream = async (
  group: string,
  consumer: string,
  count: number,
): Promise<number> => {
  await ensureStreamGroup(group);

  // 先尝试认领超时 pending（防止 worker 崩溃导致消息卡住）
  try {
    // XAUTOCLAIM key group consumer min-idle-time start [COUNT count]
    // ioredis 返回 [nextId, [ [id, [k,v...]], ... ], deletedIds? ]
    const claimed = (await (redisClient as any).xautoclaim(
      SHARE_VIEW_STREAM_KEY,
      group,
      consumer,
      60_000,
      "0-0",
      "COUNT",
      count,
    )) as unknown;
    if (Array.isArray(claimed) && Array.isArray(claimed[1]) && claimed[1].length > 0) {
      // 有 pending 被认领，走同一套处理逻辑
      const entries = claimed[1] as Array<[string, string[]]>;
      return insertAndAckEntries(group, entries);
    }
  } catch {
    // 某些 Redis 版本没有 XAUTOCLAIM；忽略即可
  }

  const data = (await redisClient.xreadgroup(
    "GROUP",
    group,
    consumer,
    "COUNT",
    count,
    "BLOCK",
    1000,
    "STREAMS",
    SHARE_VIEW_STREAM_KEY,
    ">",
  )) as unknown;

  if (!Array.isArray(data) || data.length === 0) return 0;

  const streamPart = data[0] as unknown;
  if (!Array.isArray(streamPart) || streamPart.length < 2) return 0;

  const entries = streamPart[1] as Array<[string, string[]]>;
  if (!entries || entries.length === 0) return 0;

  return insertAndAckEntries(group, entries);
};

const insertAndAckEntries = async (
  group: string,
  entries: Array<[string, string[]]>,
): Promise<number> => {
  const allEntryIds = entries.map(([id]) => id);
  const events: StreamEvent[] = entries.map(([id, rawFields]) => {
    const fields = parseStreamFields(rawFields);
    const viewedAt = Number.parseInt(fields.viewedAt ?? "0", 10);
    const emptyToNull = (v: string | undefined) => (v && v.length > 0 ? v : null);
    return {
      id,
      shareId: fields.shareId ?? "",
      viewedAt: Number.isFinite(viewedAt) ? viewedAt : 0,
      ipHash: emptyToNull(fields.ipHash),
      userAgent: emptyToNull(fields.userAgent),
      referer: emptyToNull(fields.referer),
    };
  });

  // 过滤掉脏数据（shareId/viewedAt 必须有效）
  const validEvents = events.filter((e) => e.shareId && e.viewedAt > 0);
  if (validEvents.length === 0) {
    // 也要 ack，避免卡住
    await redisClient.xack(SHARE_VIEW_STREAM_KEY, group, ...allEntryIds);
    return 0;
  }

  // 批量插入 share_view（id 用雪花生成；bigint 用字符串传参）
  const rows = validEvents.map((e) => ({
    id: generateSnowflakeId().toString(),
    share_id: e.shareId,
    viewed_at: new Date(e.viewedAt),
    ip_hash: e.ipHash,
    user_agent: e.userAgent,
    referer: e.referer,
  }));

  await sql`
    insert into share_view ${sql(rows, "id", "share_id", "viewed_at", "ip_hash", "user_agent", "referer")}
  `;

  // ack：标记消息已消费
  await redisClient.xack(SHARE_VIEW_STREAM_KEY, group, ...allEntryIds);
  return validEvents.length;
};

export type FlushOnceResult = {
  totalUpdated: number;
  dailyUpdated: number;
  eventsInserted: number;
};

/**
 * 单次 flush：把 Redis 的增量/事件批量写回 Postgres。
 * 建议用 cron 每分钟跑一次，或者用常驻 worker 定时跑。
 */
export const flushOnce = async (options?: {
  batchSize?: number;
  streamGroup?: string;
  streamConsumer?: string;
  streamBatch?: number;
}): Promise<FlushOnceResult> => {
  const batchSize = options?.batchSize ?? 500;
  const streamGroup = options?.streamGroup ?? "share_view_group";
  const streamConsumer = options?.streamConsumer ?? `worker-${process.pid}`;
  const streamBatch = options?.streamBatch ?? 500;

  // 先把计数落库，再落事件；两者互不依赖
  const [totalUpdated, dailyUpdated] = await Promise.all([
    flushTotalViewCounts(batchSize),
    flushDailyStats(batchSize),
  ]);

  // stream 可能堆积：单次尽量多消费一些（避免一直追不上）
  let eventsInserted = 0;
  for (let i = 0; i < 20; i++) {
    const n = await consumeShareViewStream(streamGroup, streamConsumer, streamBatch);
    eventsInserted += n;
    if (n === 0) break;
  }

  return { totalUpdated, dailyUpdated, eventsInserted };
};

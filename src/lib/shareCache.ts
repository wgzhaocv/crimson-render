import { sql } from "./db";
import { redisClient } from "./redis";
import { base62ToSnowflake } from "./base62";

const CACHE_PREFIX = "share:";
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h

export type ShareData = {
  id: string;
  ownerId: string;
  accessType: "public" | "password" | "private";
  pinHash: string | null;
  content: string;
  coverId: string | null;
  title: string | null;
  description: string | null;
  contentUpdatedAt: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

const getCacheKey = (shareId: bigint): string =>
  `${CACHE_PREFIX}${shareId.toString()}`;

const isShareDataLike = (
  data: unknown
): data is Pick<ShareData, "content" | "ownerId"> => {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return (
    typeof record.content === "string" && typeof record.ownerId === "string"
  );
};

type ShareRow = {
  id: string;
  ownerId: string;
  accessType: ShareData["accessType"];
  pinHash: string | null;
  content: string;
  coverId: string | null;
  title: string | null;
  description: string | null;
  contentUpdatedAt: Date | string;
  viewCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const toISOString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const serializeShareRow = (row: ShareRow): ShareData => ({
  id: row.id,
  ownerId: row.ownerId,
  accessType: row.accessType,
  pinHash: row.pinHash,
  content: row.content,
  coverId: row.coverId,
  title: row.title,
  description: row.description,
  contentUpdatedAt: toISOString(row.contentUpdatedAt),
  viewCount: row.viewCount,
  createdAt: toISOString(row.createdAt),
  updatedAt: toISOString(row.updatedAt),
});

export const getShareCacheByBase62Id = async (
  shareBase62Id: string
): Promise<ShareData | null> => {
  let shareId: bigint;
  try {
    shareId = base62ToSnowflake(shareBase62Id);
  } catch {
    return null;
  }

  const cacheKey = getCacheKey(shareId);
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (isShareDataLike(parsed)) {
        return parsed as ShareData;
      }
    } catch {
      // ignore invalid cache payload
    }
  }

  const rows = (await sql`
    select
      id::text as "id",
      owner_id as "ownerId",
      access_type as "accessType",
      pin_hash as "pinHash",
      content,
      cover_id::text as "coverId",
      title,
      description,
      content_updated_at as "contentUpdatedAt",
      view_count as "viewCount",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from share
    where id = ${shareId.toString()}::bigint
    limit 1
  `) as unknown as ShareRow[];

  const row = rows[0];
  if (!row) return null;

  const serialized = serializeShareRow(row);
  await redisClient.set(
    cacheKey,
    JSON.stringify(serialized),
    "EX",
    CACHE_TTL_SECONDS
  );
  return serialized;
};

export const getShareHtmlByBase62Id = async (
  shareBase62Id: string
): Promise<string | null> => {
  const shareData = await getShareCacheByBase62Id(shareBase62Id);
  return shareData?.content ?? null;
};

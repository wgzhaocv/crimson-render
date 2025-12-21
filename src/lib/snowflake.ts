/**
 * 雪花ID生成器（单机版）
 * 结构：1位符号位 + 41位时间戳 + 22位序列号
 */

// 起始时间戳 (2024-01-01 00:00:00 UTC)
const EPOCH = 1704067200000n;

// 序列号占用的位数
const SEQUENCE_BITS = 22n;

// 最大序列号 (约419万)
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;

// 时间戳位移量
const TIMESTAMP_SHIFT = SEQUENCE_BITS;

let sequence = 0n;
let lastTimestamp = -1n;

/**
 * 获取当前时间戳
 */
function currentTimestamp(): bigint {
  return BigInt(Date.now());
}

/**
 * 等待下一毫秒
 */
function waitNextMillis(lastTs: bigint): bigint {
  let ts = currentTimestamp();
  while (ts <= lastTs) {
    ts = currentTimestamp();
  }
  return ts;
}

/**
 * 生成雪花ID
 */
export function generateSnowflakeId(): bigint {
  let timestamp = currentTimestamp();

  if (timestamp < lastTimestamp) {
    throw new Error('Clock moved backwards. Refusing to generate id.');
  }

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & MAX_SEQUENCE;
    if (sequence === 0n) {
      timestamp = waitNextMillis(lastTimestamp);
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  return ((timestamp - EPOCH) << TIMESTAMP_SHIFT) | sequence;
}

/**
 * 解析雪花ID
 */
export function parseSnowflakeId(id: bigint): {
  timestamp: Date;
  sequence: number;
} {
  const sequence = Number(id & MAX_SEQUENCE);
  const timestamp = Number((id >> TIMESTAMP_SHIFT) + EPOCH);

  return {
    timestamp: new Date(timestamp),
    sequence,
  };
}

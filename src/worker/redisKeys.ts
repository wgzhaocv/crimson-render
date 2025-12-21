// 统一管理 view 相关 Redis key（需要与 crimson/lib/viewTracking 保持一致）

export const VIEW_COUNT_TOTAL_KEY_PREFIX = "share:vc:total:";
export const VIEW_COUNT_DAY_KEY_PREFIX = "share:vc:day:";

export const VIEW_COUNT_DIRTY_TOTAL_SET = "share:vc:dirty:total";
export const VIEW_COUNT_DIRTY_DAYS_SET = "share:vc:dirty:days";
export const VIEW_COUNT_DIRTY_DAY_SET_PREFIX = "share:vc:dirty:day:";

export const SHARE_VIEW_STREAM_KEY = "share:view:stream";
export const SHARE_UV_HLL_KEY_PREFIX = "share:uv:hll:";

export const getTotalViewKey = (shareId: string): string =>
  `${VIEW_COUNT_TOTAL_KEY_PREFIX}${shareId}`;

export const getDailyViewKey = (shareId: string, yyyymmdd: string): string =>
  `${VIEW_COUNT_DAY_KEY_PREFIX}${shareId}:${yyyymmdd}`;

export const getDirtyDaySetKey = (yyyymmdd: string): string =>
  `${VIEW_COUNT_DIRTY_DAY_SET_PREFIX}${yyyymmdd}`;

export const getDailyUvHllKey = (shareId: string, yyyymmdd: string): string =>
  `${SHARE_UV_HLL_KEY_PREFIX}${shareId}:${yyyymmdd}`;

// 把 YYYYMMDD 转成 YYYY-MM-DD（UTC）
export const yyyymmddToIsoDate = (yyyymmdd: string): string =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

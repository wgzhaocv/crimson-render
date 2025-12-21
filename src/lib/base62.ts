/**
 * Base62 编码/解码工具
 * 用于将 bigint 转换为 base62 字符串，以及反向操作
 */

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = 62n;

// 创建字符到数值的映射
const CHAR_TO_VALUE = new Map<string, bigint>();
for (let i = 0; i < CHARSET.length; i++) {
  CHAR_TO_VALUE.set(CHARSET[i], BigInt(i));
}

/**
 * 将 bigint 编码为 base62 字符串
 */
export function encodeBase62(num: bigint): string {
  if (num < 0n) {
    throw new Error('Cannot encode negative numbers');
  }

  if (num === 0n) {
    return CHARSET[0];
  }

  let result = '';
  let n = num;

  while (n > 0n) {
    result = CHARSET[Number(n % BASE)] + result;
    n = n / BASE;
  }

  return result;
}

/**
 * 将 base62 字符串解码为 bigint
 */
export function decodeBase62(str: string): bigint {
  if (!str || str.length === 0) {
    throw new Error('Cannot decode empty string');
  }

  let result = 0n;

  for (const char of str) {
    const value = CHAR_TO_VALUE.get(char);
    if (value === undefined) {
      throw new Error(`Invalid character '${char}' in base62 string`);
    }
    result = result * BASE + value;
  }

  return result;
}

/**
 * 将雪花ID (bigint) 转换为 base62 字符串
 */
export function snowflakeToBase62(id: bigint): string {
  return encodeBase62(id);
}

/**
 * 将 base62 字符串转换回雪花ID (bigint)
 */
export function base62ToSnowflake(str: string): bigint {
  return decodeBase62(str);
}

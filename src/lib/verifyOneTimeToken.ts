import { createHmac } from "crypto";
import { redisClient } from "./redis";

const SECRET_KEY = Bun.env.SECRET_KEY!;
const TOKEN_TTL = 10 * 60; // 10分钟（秒）

interface TokenVerifyResult {
  valid: boolean;
  error?: string;
}

export const verifyOneTimeToken = async (
  token: string,
  expectedShareBase62Id: string
): Promise<TokenVerifyResult> => {
  // 1. 解析 token
  const parts = token.split(":");
  if (parts.length !== 4) {
    return { valid: false, error: "invalid_format" };
  }

  const [shareBase62Id, timestamp, random, signature] = parts;

  // 2. 项目ID匹配
  if (shareBase62Id !== expectedShareBase62Id) {
    return { valid: false, error: "id_mismatch" };
  }

  // 3. 时间戳未过期（10分钟）
  const tokenTime = Number(timestamp);
  if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_TTL * 1000) {
    return { valid: false, error: "expired" };
  }

  // 4. 签名验证
  const data = `${shareBase62Id}:${timestamp}:${random}`;
  const expectedSig = createHmac("sha256", SECRET_KEY)
    .update(data)
    .digest("hex");

  if (signature !== expectedSig) {
    return { valid: false, error: "invalid_signature" };
  }

  // 5. Redis 检查是否已使用
  const redisKey = `token_used:${token}`;
  const isUsed = await redisClient.exists(redisKey);
  if (isUsed) {
    return { valid: false, error: "already_used" };
  }

  // 6. 标记为已使用
  await redisClient.set(redisKey, "1", "EX", TOKEN_TTL);

  return { valid: true };
};

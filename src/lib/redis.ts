import Redis from "ioredis";

export const redisClient = new Redis(Bun.env.REDIS_URL!);


import IORedis from "ioredis";

const redis = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

export async function waitForRateLimit(
  campaignId: string,
  hourlyLimit: number
) {
  const hourKey = Math.floor(Date.now() / 3600000);
  const key = `campaign:${campaignId}:hour:${hourKey}`;

  while (true) {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 3700);
    }

    if (count <= hourlyLimit) {
      return;
    }

    await redis.decr(key);

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );
  }
}
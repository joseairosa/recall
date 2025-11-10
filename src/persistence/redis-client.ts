import { Redis } from "ioredis";
import { IStorageClientProvider } from "./storage-client.interface";


export class RedisClientProvider implements IStorageClientProvider {
  private static client: Redis | null = null;

  async getClient(): Promise<Redis> {
    if (!RedisClientProvider.client) {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

      RedisClientProvider.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      RedisClientProvider.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
      });

      RedisClientProvider.client.on("connect", () => {
        console.error("Redis Client Connected");
      });
       RedisClientProvider.client.on("ready", () => {
         console.error("Redis Client Ready");
      });
    }

    return RedisClientProvider.client;
  }

  async closeClient(): Promise<void> {
    if (RedisClientProvider.client) {
      await RedisClientProvider.client.quit();
      RedisClientProvider.client = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis connection check failed:", error);
      return false;
    }
  }
}

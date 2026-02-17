import Redis, { Pipeline, ChainableCommander } from "ioredis";
import { StorageClient, IPipelineOperations } from "./storage-client.js";


class RedisPipelineOperations implements IPipelineOperations {
  private pipeline: ChainableCommander;

  constructor(pipeline: ChainableCommander) {
    this.pipeline = pipeline;
  }

  hset(key: string, data: Record<string, string>): void {
    this.pipeline.hset(key, data);
  }

  del(key: string): void {
    this.pipeline.del(key);
  }

  sadd(key: string, ...members: string[]): void {
    if (members.length > 0) {
      this.pipeline.sadd(key, ...members);
    }
  }

  srem(key: string, ...members: string[]): void {
    if (members.length > 0) {
      this.pipeline.srem(key, ...members);
    }
  }

  zadd(key: string, score: number, member: string): void {
    this.pipeline.zadd(key, score, member);
  }

  zrem(key: string, member: string): void {
    this.pipeline.zrem(key, member);
  }

  set(key: string, value: string): void {
    this.pipeline.set(key, value);
  }

  expire(key: string, seconds: number): void {
    this.pipeline.expire(key, seconds);
  }

  zremrangebyrank(key: string, start: number, stop: number): void {
    this.pipeline.zremrangebyrank(key, start, stop);
  }

  async exec(): Promise<void> {
    await this.pipeline.exec();
  }
}

export class RedisAdapter implements StorageClient {
  private client: Redis;

  constructor(redisClient: Redis) {
    this.client = redisClient;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, data: Record<string, string>): Promise<void> {
    await this.client.hset(key, data);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const result = await this.client.hgetall(key);
    return result || {};
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setnx(key: string, value: string): Promise<boolean> {
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.client.sadd(key, ...members);
    }
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.client.srem(key, ...members);
    }
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async sunion(...keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    return this.client.sunion(...keys);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop);
  }

  async zrangebyscore(
    key: string,
    min: number,
    max: number
  ): Promise<string[]> {
    return this.client.zrangebyscore(key, min, max);
  }

  async zrevrangebyscore(
    key: string,
    max: number,
    min: number,
    limit?: { offset: number; count: number }
  ): Promise<string[]> {
    if (limit) {
      return this.client.zrevrangebyscore(
        key,
        max,
        min,
        "LIMIT",
        limit.offset,
        limit.count
      );
    }
    return this.client.zrevrangebyscore(key, max, min);
  }

  async zremrangebyrank(
    key: string,
    start: number,
    stop: number
  ): Promise<void> {
    await this.client.zremrangebyrank(key, start, stop);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    const score = await this.client.zscore(key, member);
    return score ? String(score) : null;
  }

  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    return this.client.zcount(key, min, max);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  pipeline(): IPipelineOperations {
    const pipeline = this.client.pipeline();
    return new RedisPipelineOperations(pipeline);
  }

  async closeClient(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis connection check failed:", error);
      return false;
    }
  }   
}

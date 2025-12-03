import { StorageClient, IPipelineOperations } from "./storage-client.js";
import { Batch, GlideString, GlideClient } from "@valkey/valkey-glide";



class ValkeyPipelineOperations implements IPipelineOperations {
  private pipeline: Batch;
  private valkeyClient: GlideClient;

  constructor(pipeline: Batch, valkeyClient: GlideClient ) {
    this.pipeline = pipeline;
    this.valkeyClient = valkeyClient;
  }

  hset(key: string, data: Record<string, string>): void {
    if (!key || Object.keys(data).length === 0) return;
    this.pipeline.hset(key, data);
  }

  del(key: string): void {
    this.pipeline.del([key]);
  }

  sadd(key: string, ...members: string[]): void {
    if (members.length > 0) {
      this.pipeline.sadd(key, members);
    }
  }

  srem(key: string, ...members: string[]): void {
    if (members.length > 0) {
      this.pipeline.srem(key, members);
    }
  }

  zadd(key: string, score: number, member: string): void {
    this.pipeline.zadd(key, { [member]: score });
  }

  zrem(key: string, member: string): void {
    this.pipeline.zrem(key, [member]);
  }

  set(key: string, value: string): void {
    this.pipeline.set(key, value);
  }

  expire(key: string, seconds: number): void {
    this.pipeline.expire(key, seconds);
  }

  zremrangebyrank(key: string, start: number, stop: number): void {
    this.pipeline.zremRangeByRank(key, start, stop);
  }

  async exec(): Promise<void> {
    await this.valkeyClient.exec(this.pipeline,false);
  }
}

export class ValkeyAdapter implements StorageClient {
  private client: GlideClient;

  constructor(valkeyClient: GlideClient) {
    this.client = valkeyClient;
  }

  async hset(key: string, data: Record<string, string>): Promise<void> {
    if (!key || Object.keys(data).length === 0) return;
    await this.client.hset(key, data);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!key) return {};
    const result = await this.client.hgetall(key);
    if (!result) return {};

    // Convert HashDataType to Record<string, string>
    return Object.entries(result).reduce((acc, [key, value]) => {
      acc[String(value.field)] = String(value.value);
      return acc;
    }, {} as Record<string, string>);
  }

  async del(key: string): Promise<void> {
    if (!key) return;
    await this.client.del([key]);
  }

  async exists(key: string): Promise<boolean> {
    if (!key) return false;
    return this.client.exists([key]).then((count) => count > 0);
  }

  async get(key: string): Promise<string | null> {
    if (!key) return null;
    const value = await this.client.get(key);
    return value ? String(value) : null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!key) return;
    await this.client.set(key, value);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    if (!key || members.length === 0) return;
    await this.client.sadd(key, members.filter(Boolean));
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    if (!key || members.length === 0) return;
    await this.client.srem(key, members.filter(Boolean));
  }

  async smembers(key: string): Promise<string[]> {
    if (!key) return [];
    const result = await this.client.smembers(key);
    if (!result) return [];
    return Array.from(result).map(String);
  }

  async sunion(...keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const result = await this.client.sunion(keys.filter(Boolean));
    if (!result) return [];
    return Array.from(result).map(String);
  }

  async scard(key: string): Promise<number> {
    if (!key) return 0;
    const result = await this.client.scard(key);
    return result || 0;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    if (!key || !member) return;
    await this.client.zadd(key, { [member]: score }); // Fix object format
  }

  async zrem(key: string, member: string): Promise<void> {
    if (!key || !member) return;
    await this.client.zrem(key, [member]);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!key) return [];
    const result = await this.client.zrange(key, { start: start, end: stop });
    if (!result) return [];
    return Array.from(result).map(String);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!key) return [];
    const result = await this.client.zrange(
      key,
      { start: start, end: stop },
      { reverse: true }
    );
    if (!result) return [];
    return Array.from(result).map(String);
  }
  async zrangebyscore(
    key: string,
    min: number,
    max: number
  ): Promise<string[]> {
    if (!key) return [];
    try {
      const result = await this.client.zrangeWithScores(key, {
        start: { value: min, isInclusive: true }, // Changed to inclusive
        end: { value: max, isInclusive: true },
        type: "byScore",
      });
      if (!result) return [];
      return result.map(item => item.element.toString()); // Extract the 'element' from each object in the array
    } catch (error) {
      console.error("Error in zrangebyscore:", error);
      return [];
    }
  }

  async zrevrangebyscore(
    key: string,
    max: number,
    min: number,
    limit?: { offset: number; count: number }
  ): Promise<string[]> {
    if (!key) return [];

    const result = await this.client.zrangeWithScores(
      key,
      {
        start: { value: min, isInclusive: true },
        end: { value: max, isInclusive: true },
        type: "byScore",
        ...(limit && { count: limit.count, offset: limit.offset }),
      },
      { reverse: true }
    );

    if (!result) return [];
    return result.map(item => item.element.toString());
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<void> {
        if (!key) return;
        await this.client.zremRangeByRank(key, start, stop);
    }

  async zcard(key: string): Promise<number> {
    if (!key) return 0;
    try {
      const result = await this.client.zcard(key);
      return result || 0;
    } catch (error) {
      console.error("Error in zcard:", error);
      return 0;
    }
  }

  async zscore(key: string, member: string): Promise<string | null> {
    if (!key || !member) return null;
    try {
      const score = await this.client.zscore(key, member);
      return score !== null ? String(score) : null;
    } catch (error) {
      console.error("Error in zscore:", error);
      return null;
    }
  }

  pipeline(): IPipelineOperations {
    const pipeline = new Batch(false);
    return new ValkeyPipelineOperations(pipeline,this.client);
  }

  async closeClient(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }     

  async checkConnection(): Promise<boolean> {  
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Valkey connection check failed:", error);
      return false;
    }
  }
}

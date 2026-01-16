export interface StorageClient {
  // Basic Operations
  hset(key: string, data: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  
  // Set Operations
  sadd(key: string, ...members: string[]): Promise<void>;
  srem(key: string, ...members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
  sunion(...keys: string[]): Promise<string[]>;
  scard(key: string): Promise<number>;
  
  // Sorted Set Operations
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  zrevrangebyscore(key: string, max: number, min: number, limit?: { offset: number; count: number }): Promise<string[]>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<void>;
  zcard(key: string): Promise<number>;
  zscore(key: string, member: string): Promise<string | null>;
  zcount(key: string, min: number | string, max: number | string): Promise<number>;

  // Key Operations
  expire(key: string, seconds: number): Promise<boolean>;
  
  // Pipeline Operations
  pipeline(): IPipelineOperations;

  closeClient(): Promise<void>;
  checkConnection(): Promise<boolean>;

}

export interface IPipelineOperations {
  hset(key: string, data: Record<string, string>): void;
  del(key: string): void;
  sadd(key: string, ...members: string[]): void;
  srem(key: string, ...members: string[]): void;
  zadd(key: string, score: number, member: string): void;
  zrem(key: string, member: string): void;
  set(key: string, value: string): void;
  expire(key: string, seconds: number): void;
  zremrangebyrank(key: string, start: number, stop: number): void;

  // execute/commit queued operations
  exec(): Promise<void>;
}

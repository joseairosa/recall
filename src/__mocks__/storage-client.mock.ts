/**
 * Mock StorageClient for unit testing
 *
 * Provides an in-memory implementation of StorageClient interface
 * for testing services without Redis dependency.
 */

import { StorageClient, IPipelineOperations } from '../persistence/storage-client.js';

export class MockStorageClient implements StorageClient {
  private store: Map<string, string> = new Map();
  private hashStore: Map<string, Record<string, string>> = new Map();
  private setStore: Map<string, Set<string>> = new Map();
  private sortedSetStore: Map<string, Map<string, number>> = new Map();

  // String operations
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.hashStore.delete(key);
    this.setStore.delete(key);
    this.sortedSetStore.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (
      this.store.has(key) ||
      this.hashStore.has(key) ||
      this.setStore.has(key) ||
      this.sortedSetStore.has(key)
    );
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashStore.get(key);
    return hash?.[field] ?? null;
  }

  async hset(key: string, data: Record<string, string>): Promise<void> {
    const existing = this.hashStore.get(key) || {};
    this.hashStore.set(key, { ...existing, ...data });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.hashStore.get(key) ?? {};
  }

  async hdel(key: string, field: string): Promise<void> {
    const hash = this.hashStore.get(key);
    if (hash) {
      delete hash[field];
    }
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<void> {
    const set = this.setStore.get(key) || new Set();
    members.forEach((m) => set.add(m));
    this.setStore.set(key, set);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    const set = this.setStore.get(key);
    if (set) {
      members.forEach((m) => set.delete(m));
    }
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.setStore.get(key);
    return set ? [...set] : [];
  }

  async sunion(...keys: string[]): Promise<string[]> {
    const result = new Set<string>();
    for (const key of keys) {
      const set = this.setStore.get(key);
      if (set) {
        set.forEach((m) => result.add(m));
      }
    }
    return [...result];
  }

  async scard(key: string): Promise<number> {
    const set = this.setStore.get(key);
    return set ? set.size : 0;
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<void> {
    const zset = this.sortedSetStore.get(key) || new Map();
    zset.set(member, score);
    this.sortedSetStore.set(key, zset);
  }

  async zrem(key: string, member: string): Promise<void> {
    const zset = this.sortedSetStore.get(key);
    if (zset) {
      zset.delete(member);
    }
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    const entries = [...zset.entries()].sort((a, b) => a[1] - b[1]);

    // Handle negative indices
    const len = entries.length;
    const startIdx = start < 0 ? Math.max(0, len + start) : start;
    const endIdx = stop < 0 ? len + stop + 1 : stop + 1;
    return entries.slice(startIdx, endIdx).map(([value]) => value);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    const entries = [...zset.entries()].sort((a, b) => b[1] - a[1]);

    // Handle negative indices
    const len = entries.length;
    const startIdx = start < 0 ? Math.max(0, len + start) : start;
    const endIdx = stop < 0 ? len + stop + 1 : stop + 1;
    return entries.slice(startIdx, endIdx).map(([value]) => value);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    return [...zset.entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([value]) => value);
  }

  async zrevrangebyscore(
    key: string,
    max: number,
    min: number,
    limit?: { offset: number; count: number }
  ): Promise<string[]> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    let entries = [...zset.entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => b[1] - a[1]);

    if (limit) {
      entries = entries.slice(limit.offset, limit.offset + limit.count);
    }

    return entries.map(([value]) => value);
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<void> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return;

    const entries = [...zset.entries()].sort((a, b) => a[1] - b[1]);
    const len = entries.length;
    const startIdx = start < 0 ? Math.max(0, len + start) : start;
    const endIdx = stop < 0 ? len + stop + 1 : stop + 1;

    const toRemove = entries.slice(startIdx, endIdx);
    toRemove.forEach(([member]) => zset.delete(member));
  }

  async zcard(key: string): Promise<number> {
    const zset = this.sortedSetStore.get(key);
    return zset ? zset.size : 0;
  }

  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return 0;

    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);

    return [...zset.values()].filter((score) => score >= minVal && score <= maxVal).length;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return null;
    const score = zset.get(member);
    return score !== undefined ? String(score) : null;
  }

  // Key Operations
  async expire(key: string, _seconds: number): Promise<boolean> {
    // In-memory mock doesn't implement TTL, just return true if key exists
    return (
      this.store.has(key) ||
      this.hashStore.has(key) ||
      this.setStore.has(key) ||
      this.sortedSetStore.has(key)
    );
  }

  // Pipeline operations (sync, returns IPipelineOperations)
  pipeline(): IPipelineOperations {
    const operations: Array<() => Promise<void>> = [];
    const self = this;

    return {
      hset(key: string, data: Record<string, string>) {
        operations.push(() => self.hset(key, data));
      },
      del(key: string) {
        operations.push(() => self.del(key));
      },
      sadd(key: string, ...members: string[]) {
        operations.push(() => self.sadd(key, ...members));
      },
      srem(key: string, ...members: string[]) {
        operations.push(() => self.srem(key, ...members));
      },
      zadd(key: string, score: number, member: string) {
        operations.push(() => self.zadd(key, score, member));
      },
      zrem(key: string, member: string) {
        operations.push(() => self.zrem(key, member));
      },
      set(key: string, value: string) {
        operations.push(() => self.set(key, value));
      },
      expire(key: string, seconds: number) {
        operations.push(async () => {
          await self.expire(key, seconds);
        });
      },
      zremrangebyrank(key: string, start: number, stop: number) {
        operations.push(() => self.zremrangebyrank(key, start, stop));
      },
      async exec() {
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  // Connection methods
  async closeClient(): Promise<void> {
    this.clear();
  }

  async checkConnection(): Promise<boolean> {
    return true;
  }

  // Test helpers
  clear(): void {
    this.store.clear();
    this.hashStore.clear();
    this.setStore.clear();
    this.sortedSetStore.clear();
  }

  getHashStore(): Map<string, Record<string, string>> {
    return this.hashStore;
  }

  getSetStore(): Map<string, Set<string>> {
    return this.setStore;
  }
}

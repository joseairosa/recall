/**
 * Mock StorageClient for unit testing
 *
 * Provides an in-memory implementation of StorageClient interface
 * for testing services without Redis dependency.
 */

import { StorageClient } from '../../src/persistence/storage-client.js';

export class MockStorageClient implements StorageClient {
  private store: Map<string, string> = new Map();
  private hashStore: Map<string, Record<string, string>> = new Map();
  private setStore: Map<string, Set<string>> = new Map();
  private sortedSetStore: Map<string, Map<string, number>> = new Map();

  // String operations
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, options?: { ex?: number }): Promise<void> {
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

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const allKeys = [
      ...this.store.keys(),
      ...this.hashStore.keys(),
      ...this.setStore.keys(),
      ...this.sortedSetStore.keys(),
    ];
    return [...new Set(allKeys)].filter((key) => regex.test(key));
  }

  async scan(
    cursor: number,
    options?: { match?: string; count?: number }
  ): Promise<{ cursor: number; keys: string[] }> {
    const allKeys = await this.keys(options?.match || '*');
    return { cursor: 0, keys: allKeys };
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

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.hashStore.get(key) ?? null;
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

  async scard(key: string): Promise<number> {
    const set = this.setStore.get(key);
    return set ? set.size : 0;
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const set = this.setStore.get(key);
    return set ? set.has(member) : false;
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

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: { withScores?: boolean; rev?: boolean }
  ): Promise<string[] | Array<{ value: string; score: number }>> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    let entries = [...zset.entries()].sort((a, b) =>
      options?.rev ? b[1] - a[1] : a[1] - b[1]
    );

    // Handle negative indices
    const len = entries.length;
    const startIdx = start < 0 ? Math.max(0, len + start) : start;
    const endIdx = stop < 0 ? len + stop + 1 : stop + 1;
    entries = entries.slice(startIdx, endIdx);

    if (options?.withScores) {
      return entries.map(([value, score]) => ({ value, score }));
    }
    return entries.map(([value]) => value);
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    options?: { limit?: { offset: number; count: number } }
  ): Promise<string[]> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return [];

    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' ? Infinity : Number(max);

    let entries = [...zset.entries()]
      .filter(([, score]) => score >= minVal && score <= maxVal)
      .sort((a, b) => a[1] - b[1]);

    if (options?.limit) {
      entries = entries.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count
      );
    }

    return entries.map(([value]) => value);
  }

  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    const results = await this.zrangebyscore(key, min, max);
    return results.length;
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const zset = this.sortedSetStore.get(key);
    if (!zset) return null;
    return zset.get(member) ?? null;
  }

  // Pipeline operations
  async pipeline(): Promise<{
    hset: (key: string, data: Record<string, string>) => void;
    sadd: (key: string, member: string) => void;
    srem: (key: string, member: string) => void;
    zadd: (key: string, score: number, member: string) => void;
    zrem: (key: string, member: string) => void;
    del: (key: string) => void;
    exec: () => Promise<void>;
  }> {
    const operations: Array<() => Promise<void>> = [];
    const self = this;

    return {
      hset(key: string, data: Record<string, string>) {
        operations.push(() => self.hset(key, data));
      },
      sadd(key: string, member: string) {
        operations.push(() => self.sadd(key, member));
      },
      srem(key: string, member: string) {
        operations.push(() => self.srem(key, member));
      },
      zadd(key: string, score: number, member: string) {
        operations.push(() => self.zadd(key, score, member));
      },
      zrem(key: string, member: string) {
        operations.push(() => self.zrem(key, member));
      },
      del(key: string) {
        operations.push(() => self.del(key));
      },
      async exec() {
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  // Connection
  async disconnect(): Promise<void> {
    this.clear();
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

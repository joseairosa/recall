import { IStorageClientProvider } from './storage-client.interface';
import { RedisClientProvider } from './redis-client.js';
import { ValkeyClientProvider } from './valkey-client.js';
import { ValkeyAdapter } from './valkey-adapter.js';
import { StorageClient } from './storage-client.js';
import { RedisAdapter } from './redis-adapter.js';

export async function createStorageClient(): Promise<StorageClient> {
  const storageType = process.env.BACKEND_TYPE?.toLowerCase() || 'redis';

  switch (storageType) {
    case 'valkey':
      const valkeyClient = await new ValkeyClientProvider().getClient();
      return new ValkeyAdapter(valkeyClient);
    case 'redis':
    default:
      const redisClient = await new RedisClientProvider().getClient();
      return new RedisAdapter(redisClient);
  }
}
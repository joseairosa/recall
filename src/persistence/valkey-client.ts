import { GlideClient } from "@valkey/valkey-glide";
import { IStorageClientProvider } from './storage-client.interface';

export class ValkeyClientProvider implements IStorageClientProvider {
  private static client: GlideClient | null = null;

  async getClient(): Promise<GlideClient> {
    if (!ValkeyClientProvider.client) {
      const valkeyHost = process.env.VALKEY_HOST || "localhost";
      const valkeyPort = Number(process.env.VALKEY_PORT) || 6379;
      const databaseId = Number(process.env.VALKEY_DB) || 0;
      ValkeyClientProvider.client = await GlideClient.createClient({
        addresses: [{ host: valkeyHost, port: valkeyPort }],
        databaseId: databaseId
      });
    }

    return ValkeyClientProvider.client;
  }

  async closeClient(): Promise<void> {
    if (ValkeyClientProvider.client) {
      await ValkeyClientProvider.client.close();
      ValkeyClientProvider.client = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    console.error("Checking Valkey connection...");
    try {
      const client = await this.getClient();
      const result = await client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Valkey connection check failed:", error);
      return false;
    }
  }
}

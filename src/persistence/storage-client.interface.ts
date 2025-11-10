import { StorageClient } from "./storage-client";

export interface IStorageClientProvider {
  getClient(): Promise<any>;
}

export interface IStorageClientProvider {
  getClient(): Promise<unknown>;
  closeClient(): Promise<void>;
  checkConnection(): Promise<boolean>;
}

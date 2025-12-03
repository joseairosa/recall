export interface IStorageClientProvider {
  getClient(): Promise<unknown>;
}

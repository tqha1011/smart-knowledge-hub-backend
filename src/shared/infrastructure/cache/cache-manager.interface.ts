export abstract class IApplicationCache {
  abstract get<T>(key: string): Promise<T | undefined>;
  abstract set(key: string, value: string, ttl?: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
}

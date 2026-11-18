import { Injectable } from '@nestjs/common';

import { GeocodingResult } from '../interfaces/geocoding-provider.interface';

interface CacheEntry {
  value: GeocodingResult;
  expiresAt: number;
}

@Injectable()
export class GeocodingCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  private readonly ttlMs = 24 * 60 * 60 * 1000;

  private readonly maxEntries = 1000;

  get(key: string): GeocodingResult | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry.value };
  }

  set(key: string, value: GeocodingResult): void {
    // Remove expired entries before checking capacity.
    this.removeExpiredEntries();

    // Refresh insertion order when updating an existing key.
    this.cache.delete(key);

    // Evict the oldest entry when the cache is full.
    if (this.cache.size >= this.maxEntries) {
      let oldestKey: string | undefined;

      for (const key of this.cache.keys()) {
        oldestKey = key;
        break;
      }

      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  private removeExpiredEntries(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

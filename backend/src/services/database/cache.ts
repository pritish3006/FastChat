import logger from '../../utils/logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

interface CacheOptions {
  ttl?: number;        // Time to live in milliseconds
  maxSize?: number;    // Maximum number of items in cache
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxSize: number;
  private globalVersion = 0;  // For bulk invalidation
  
  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 60000;  // Default 1 minute
    this.maxSize = options.maxSize || 1000;  // Default 1000 items
  }

  /**
   * Get an item from cache
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);
      return null;
    }

    // Check if entry is from an old version
    if (entry.version < this.globalVersion) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set an item in cache
   */
  set(key: string, data: T): void {
    // Enforce cache size limit
    if (this.store.size >= this.maxSize) {
      // Remove oldest entries
      const entriesToDelete = Array.from(this.store.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, Math.ceil(this.maxSize * 0.2));  // Remove 20% of oldest entries
      
      for (const [key] of entriesToDelete) {
        this.store.delete(key);
      }
    }

    this.store.set(key, {
      data,
      timestamp: Date.now(),
      version: this.globalVersion
    });
  }

  /**
   * Delete an item from cache
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete multiple items by prefix
   */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.globalVersion++;
    logger.info('Cache invalidated globally', { 
      newVersion: this.globalVersion,
      entriesAffected: this.store.size 
    });
  }

  /**
   * Get or set cache with a loader function
   */
  async getOrSet(
    key: string, 
    loader: () => Promise<T>,
    options: { forceFresh?: boolean } = {}
  ): Promise<T> {
    if (!options.forceFresh) {
      const cached = this.get(key);
      if (cached !== null) {
        return cached;
      }
    }

    const data = await loader();
    this.set(key, data);
    return data;
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > this.ttl || entry.version < this.globalVersion) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      globalVersion: this.globalVersion
    };
  }
}

// Create cache instances for different entity types
export const cacheManager = {
  sessions: new Cache<any>({ ttl: 5 * 60 * 1000 }),    // 5 minutes for sessions
  messages: new Cache<any>({ ttl: 60 * 1000 }),        // 1 minute for messages
  users: new Cache<any>({ ttl: 30 * 60 * 1000 }),      // 30 minutes for users
  preferences: new Cache<any>({ ttl: 15 * 60 * 1000 }) // 15 minutes for preferences
}; 
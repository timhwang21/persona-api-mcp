/**
 * Cache implementation for API responses
 * 
 * This module provides an in-memory cache with TTL support for storing
 * and retrieving API responses efficiently.
 */

import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { CacheError } from '../utils/errors.js';

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  enabled?: boolean;
}

/**
 * In-memory cache with TTL and LRU eviction
 */
export class Cache<T = unknown> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly config = getConfig();
  private readonly options: Required<CacheOptions>;
  
  // Statistics
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0,
    hitRate: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? this.config.cache.ttl * 1000, // Convert to milliseconds
      maxSize: options.maxSize ?? this.config.cache.maxSize,
      enabled: options.enabled ?? this.config.cache.enabled,
    };

    // Setup cleanup interval for expired entries
    this.setupCleanupInterval();
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    if (!this.options.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      logger.debug('Cache miss', { key });
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      logger.debug('Cache miss (expired)', { key, expiresAt: entry.expiresAt });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    this.updateHitRate();
    
    logger.debug('Cache hit', { 
      key, 
      accessCount: entry.accessCount,
      age: Date.now() - entry.createdAt,
    });
    
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, customTtl?: number): void {
    if (!this.options.enabled) {
      return;
    }

    try {
      const now = Date.now();
      const ttl = customTtl ?? this.options.ttl;
      
      const entry: CacheEntry<T> = {
        data: value,
        expiresAt: now + ttl,
        createdAt: now,
        accessCount: 0,
        lastAccessed: now,
      };

      // Evict entries if cache is full
      this.evictIfNecessary();

      this.cache.set(key, entry);
      this.stats.sets++;
      this.stats.size = this.cache.size;

      logger.debug('Cache set', { 
        key, 
        ttl,
        expiresAt: entry.expiresAt,
        size: this.cache.size,
      });
    } catch (error) {
      logger.error('Cache set error', error as Error, { key });
      throw new CacheError(`Failed to set cache entry: ${key}`, { key });
    }
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    if (!this.options.enabled) {
      return false;
    }

    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
      logger.debug('Cache delete', { key });
    }

    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    if (!this.options.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    
    logger.info('Cache cleared', { clearedEntries: size });
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    if (!this.options.enabled) {
      return [];
    }

    return Array.from(this.cache.keys()).filter(key => {
      const entry = this.cache.get(key);
      return entry && !this.isExpired(entry);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Get cache configuration
   */
  getOptions(): Required<CacheOptions> {
    return { ...this.options };
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Evict entries if cache is at max size
   */
  private evictIfNecessary(): void {
    if (this.cache.size < this.options.maxSize) {
      return;
    }

    // Find the least recently used entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      
      logger.debug('Cache eviction', { 
        evictedKey: oldestKey,
        reason: 'max_size_reached',
        maxSize: this.options.maxSize,
      });
    }
  }

  /**
   * Update hit rate statistic
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Setup cleanup interval for expired entries
   */
  private setupCleanupInterval(): void {
    // Run cleanup every 5 minutes
    const cleanupInterval = 5 * 60 * 1000;
    
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, cleanupInterval);
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanupCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      this.stats.size = this.cache.size;
      logger.debug('Cache cleanup completed', { 
        cleanedEntries: cleanupCount,
        remainingEntries: this.cache.size,
      });
    }
  }
}

/**
 * Global cache instances for different data types
 */
export const inquiryCache = new Cache();
export const resourceCache = new Cache();

/**
 * Generate cache key for API responses
 */
export function generateCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * Generate cache key for inquiry resources
 */
export function generateInquiryCacheKey(inquiryId: string, include?: string[]): string {
  const includeKey = include && include.length > 0 ? include.sort().join(',') : 'basic';
  return generateCacheKey('inquiry', inquiryId, includeKey);
}

/**
 * Generate cache key for inquiry list resources
 */
export function generateInquiryListCacheKey(params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  
  return generateCacheKey('inquiry_list', Buffer.from(sortedParams).toString('base64'));
}
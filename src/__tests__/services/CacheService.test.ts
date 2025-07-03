import { CacheService, createSearchCacheKey, createBM25CacheKey } from '../../services/CacheService.js';

describe('CacheService', () => {
  let cache: CacheService<string>;

  beforeEach(() => {
    cache = new CacheService<string>(3); // 작은 크기로 테스트
  });

  describe('Basic Operations', () => {
    test('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.size()).toBe(1);
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'updated_value1');
      expect(cache.get('key1')).toBe('updated_value1');
      expect(cache.size()).toBe(1);
    });

    test('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('LRU Behavior', () => {
    test('should evict least recently used items when capacity is exceeded', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // key1 should be evicted

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
      expect(cache.size()).toBe(3);
    });

    test('should update access order when getting values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // key1에 접근하여 최근 사용으로 만듦
      cache.get('key1');
      
      cache.set('key4', 'value4'); // key2가 제거되어야 함

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('Cache Statistics', () => {
    test('should track hits and misses correctly', () => {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    test('should provide correct cache statistics', () => {
      cache.set('oldest', 'value1');
      cache.set('newest', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.oldestEntry).toBe('oldest');
      expect(stats.newestEntry).toBe('newest');
    });
  });

  describe('Utility Methods', () => {
    test('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1'); // generate some stats

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    test('should return all keys and values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const keys = cache.keys();
      const values = cache.values();

      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(values).toContain('value1');
      expect(values).toContain('value2');
    });

    test('should delete by pattern', () => {
      cache.set('search:test1', 'value1');
      cache.set('search:test2', 'value2');
      cache.set('bm25:test', 'value3');

      const deletedCount = cache.deleteByPattern(/^search:/);

      expect(deletedCount).toBe(2);
      expect(cache.has('search:test1')).toBe(false);
      expect(cache.has('search:test2')).toBe(false);
      expect(cache.has('bm25:test')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for invalid max size', () => {
      expect(() => new CacheService(0)).toThrow('캐시 최대 크기는 1 이상이어야 합니다.');
      expect(() => new CacheService(-1)).toThrow('캐시 최대 크기는 1 이상이어야 합니다.');
    });
  });
});

describe('Cache Key Functions', () => {
  describe('createSearchCacheKey', () => {
    test('should create consistent cache keys', () => {
      const key1 = createSearchCacheKey(['test', 'keyword'], 'domain1', 10);
      const key2 = createSearchCacheKey(['keyword', 'test'], 'domain1', 10);
      
      expect(key1).toBe(key2); // 키워드 순서는 정렬됨
    });

    test('should handle optional parameters', () => {
      const key1 = createSearchCacheKey(['test']);
      const key2 = createSearchCacheKey(['test'], undefined, undefined);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('all'); // 기본 도메인
      expect(key1).toContain('default'); // 기본 maxResults
    });

    test('should create different keys for different parameters', () => {
      const key1 = createSearchCacheKey(['test'], 'domain1');
      const key2 = createSearchCacheKey(['test'], 'domain2');
      const key3 = createSearchCacheKey(['test'], 'domain1', 20);
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  describe('createBM25CacheKey', () => {
    test('should create cache keys for BM25 calculations', () => {
      const key1 = createBM25CacheKey('test query', 'domain1');
      const key2 = createBM25CacheKey('test query');
      
      expect(key1).toContain('bm25:test query:domain1');
      expect(key2).toContain('bm25:test query:global');
    });

    test('should create different keys for different queries', () => {
      const key1 = createBM25CacheKey('query1');
      const key2 = createBM25CacheKey('query2');
      
      expect(key1).not.toBe(key2);
    });
  });
});
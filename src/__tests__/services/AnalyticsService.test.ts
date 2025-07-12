import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AnalyticsService } from '../../services/AnalyticsService.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('recordSearchQuery', () => {
    test('should record search query with all parameters', async () => {
      await service.recordSearchQuery(
        ['test', 'keyword'],
        'company',
        10,
        5,
        150,
        false,
        'user123'
      );

      const analytics = await service.getSearchAnalytics(1);
      
      expect(analytics.totalQueries).toBe(1);
      expect(analytics.avgResponseTime).toBe(150);
      expect(analytics.cacheHitRate).toBe(0);
    });

    test('should handle multiple search queries', async () => {
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, true);
      await service.recordSearchQuery(['search'], 'product', 10, 3, 200, false);
      await service.recordSearchQuery(['api'], 'technical', 10, 8, 150, true);

      const analytics = await service.getSearchAnalytics(1);
      
      expect(analytics.totalQueries).toBe(3);
      expect(analytics.cacheHitRate).toBeCloseTo(0.67, 2); // 2/3 cache hits
    });

    test('should track keywords correctly', async () => {
      await service.recordSearchQuery(['payment', 'api'], 'company', 10, 5, 100, false);
      await service.recordSearchQuery(['payment', 'method'], 'company', 10, 3, 150, false);
      await service.recordSearchQuery(['api', 'authentication'], 'technical', 10, 2, 200, false);

      const analytics = await service.getSearchAnalytics(1);
      
      const paymentKeyword = analytics.topKeywords.find(k => k.keyword === 'payment');
      const apiKeyword = analytics.topKeywords.find(k => k.keyword === 'api');
      
      expect(paymentKeyword?.count).toBe(2);
      expect(apiKeyword?.count).toBe(2);
    });

    test('should track domain statistics', async () => {
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, true);
      await service.recordSearchQuery(['test'], 'company', 10, 3, 200, false);
      await service.recordSearchQuery(['test'], 'product', 10, 2, 150, true);

      const analytics = await service.getSearchAnalytics(1);
      
      const companyStats = analytics.topDomains.find(d => d.domain === 'company');
      expect(companyStats?.queryCount).toBe(2);
      expect(companyStats?.avgResponseTime).toBe(150);
      expect(companyStats?.cacheHitRate).toBe(0.5);
    });
  });

  describe('getSearchAnalytics', () => {
    test('should return empty analytics when no queries', async () => {
      const analytics = await service.getSearchAnalytics(24);
      
      expect(analytics.totalQueries).toBe(0);
      expect(analytics.avgResponseTime).toBe(0);
      expect(analytics.cacheHitRate).toBe(0);
      expect(analytics.topKeywords).toHaveLength(0);
      expect(analytics.topDomains).toHaveLength(0);
    });

    test('should filter queries by time range', async () => {
      // 현재 시간에 쿼리 기록
      await service.recordSearchQuery(['current'], 'company', 10, 5, 100, false);
      
      // 2시간 전 쿼리 기록
      jest.setSystemTime(new Date('2024-01-01T10:00:00Z'));
      await service.recordSearchQuery(['old'], 'company', 10, 5, 100, false);
      
      // 현재 시간으로 복귀
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
      
      // 1시간 범위로 조회
      const analytics = await service.getSearchAnalytics(1);
      
      expect(analytics.totalQueries).toBe(1);
      expect(analytics.topKeywords[0].keyword).toBe('current');
    });

    test('should calculate performance metrics', async () => {
      // 다양한 응답 시간으로 쿼리 기록
      const responseTimes = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      
      for (const time of responseTimes) {
        await service.recordSearchQuery(['test'], 'company', 10, 5, time, false);
      }

      const analytics = await service.getSearchAnalytics(1);
      
      expect(analytics.performanceMetrics.p50ResponseTime).toBe(275); // 중간값
      expect(analytics.performanceMetrics.p90ResponseTime).toBe(455); // 90퍼센타일
      expect(analytics.performanceMetrics.p99ResponseTime).toBe(495.5); // 99퍼센타일
    });

    test('should identify slowest queries', async () => {
      await service.recordSearchQuery(['fast'], 'company', 10, 5, 50, false);
      await service.recordSearchQuery(['slow1'], 'product', 10, 5, 500, false);
      await service.recordSearchQuery(['slow2'], 'technical', 10, 5, 400, false);
      await service.recordSearchQuery(['medium'], 'company', 10, 5, 200, false);

      const analytics = await service.getSearchAnalytics(1);
      
      expect(analytics.performanceMetrics.slowestQueries).toHaveLength(3);
      expect(analytics.performanceMetrics.slowestQueries[0].responseTime).toBe(500);
      expect(analytics.performanceMetrics.slowestQueries[0].keywords).toContain('slow1');
    });

    test('should calculate time-based statistics', async () => {
      // 다른 시간대에 쿼리 기록
      jest.setSystemTime(new Date('2024-01-01T09:00:00Z'));
      await service.recordSearchQuery(['morning'], 'company', 10, 5, 100, false);
      
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
      await service.recordSearchQuery(['noon1'], 'company', 10, 5, 150, false);
      await service.recordSearchQuery(['noon2'], 'company', 10, 5, 200, false);
      
      jest.setSystemTime(new Date('2024-01-01T18:00:00Z'));
      await service.recordSearchQuery(['evening'], 'company', 10, 5, 120, false);

      const analytics = await service.getSearchAnalytics(24);
      
      const noonStats = analytics.timeBasedStats.find(s => s.hour === 12);
      expect(noonStats?.queryCount).toBe(2);
      expect(noonStats?.avgResponseTime).toBe(175);
    });
  });

  describe('getUserStats', () => {
    test('should track user statistics', async () => {
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, false, 'user1');
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, false, 'user1');
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, false, 'user2');
      await service.recordSearchQuery(['test'], 'company', 10, 5, 100, false);

      const userStats = service.getUserStats(24);
      
      expect(userStats.totalUsers).toBe(2);
      expect(userStats.avgQueriesPerUser).toBe(1.5);
      expect(userStats.topUsers[0].userId).toBe('user1');
      expect(userStats.topUsers[0].queryCount).toBe(2);
    });

    test('should handle no user data', () => {
      const userStats = service.getUserStats(24);
      
      expect(userStats.totalUsers).toBe(0);
      expect(userStats.activeUsers).toBe(0);
      expect(userStats.avgQueriesPerUser).toBe(0);
      expect(userStats.topUsers).toHaveLength(0);
    });
  });

  describe('getSystemMetrics', () => {
    test('should calculate system metrics', () => {
      const cacheStats = {
        size: 50,
        hitRate: 0.75,
        evictions: 10
      };

      const metrics = service.getSystemMetrics(100, 500, cacheStats);
      
      expect(metrics.documentStats.totalDocuments).toBe(100);
      expect(metrics.documentStats.totalChunks).toBe(500);
      expect(metrics.documentStats.avgDocumentSize).toBe(5);
      expect(metrics.cacheStats.size).toBe(50);
      expect(metrics.cacheStats.hitRate).toBe(0.75);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    test('should handle missing cache stats', () => {
      const metrics = service.getSystemMetrics(100, 500);
      
      expect(metrics.cacheStats.size).toBe(0);
      expect(metrics.cacheStats.hitRate).toBe(0);
      expect(metrics.cacheStats.evictionCount).toBe(0);
    });

    test('should calculate memory usage', () => {
      const metrics = service.getSystemMetrics(100, 500);
      
      expect(metrics.memoryUsage.used).toBeGreaterThan(0);
      expect(metrics.memoryUsage.total).toBeGreaterThan(0);
      expect(metrics.memoryUsage.percentage).toBeGreaterThanOrEqual(0);
      expect(metrics.memoryUsage.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('edge cases', () => {
    test('should handle queries with empty keywords', async () => {
      await service.recordSearchQuery([], 'company', 10, 0, 100, false);
      
      const analytics = await service.getSearchAnalytics(1);
      expect(analytics.totalQueries).toBe(1);
      expect(analytics.topKeywords).toHaveLength(0);
    });

    test('should handle queries with undefined domain', async () => {
      await service.recordSearchQuery(['test'], undefined, 10, 5, 100, false);
      
      const analytics = await service.getSearchAnalytics(1);
      const unknownDomain = analytics.topDomains.find(d => d.domain === 'unknown');
      expect(unknownDomain?.queryCount).toBe(1);
    });

    test('should limit top domains to 10', async () => {
      // 15개의 다른 도메인에 쿼리 기록
      for (let i = 0; i < 15; i++) {
        await service.recordSearchQuery(['test'], `domain${i}`, 10, 5, 100, false);
      }

      const analytics = await service.getSearchAnalytics(1);
      expect(analytics.topDomains).toHaveLength(10);
    });

    test('should handle single-character keywords', async () => {
      await service.recordSearchQuery(['a', 'test', 'b'], 'company', 10, 5, 100, false);
      
      const analytics = await service.getSearchAnalytics(1);
      
      // 1글자 키워드는 제외됨
      expect(analytics.topKeywords.find(k => k.keyword === 'a')).toBeUndefined();
      expect(analytics.topKeywords.find(k => k.keyword === 'test')).toBeDefined();
    });
  });
}); 
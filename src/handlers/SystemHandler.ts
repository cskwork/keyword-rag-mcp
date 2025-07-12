import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { ServerStateManager } from '../server/ServerStateManager.js';

/**
 * 시스템 관련 MCP 도구 핸들러
 */
export class SystemHandler {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * 상태 점검 도구 처리
   */
  async handleHealthCheck(): Promise<{ content: TextContent[] }> {
    console.error(`[DEBUG] 상태 점검 요청`);

    try {
      const servicesStatus = this.stateManager.getServicesStatus();
      const repository = this.stateManager.repository;
      const validationService = this.stateManager.validationService;

      // 기본 서비스 상태
      const baseStatus: any = {
        server: {
          initialized: servicesStatus.isInitialized,
          initializing: servicesStatus.isInitializing,
          uptime: process.uptime(),
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform
        },
        services: servicesStatus,
        timestamp: new Date().toISOString()
      };

      // 저장소 상태 (초기화된 경우에만)
      if (repository?.isInitialized()) {
        const stats = repository.getStatistics();
        baseStatus['repository'] = {
          ...stats,
          healthy: stats.totalDocuments > 0
        };
      }

      // 전체 시스템 건강 상태 검증
      if (validationService) {
        const healthCheck = await validationService.performHealthCheck();
        baseStatus['health'] = {
          healthy: healthCheck.status === 'healthy',
          status: healthCheck.status,
          details: healthCheck.checks
        };
      }

      console.error(`[DEBUG] 상태 점검 완료: healthy=${baseStatus['health']?.healthy || false}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(baseStatus, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 상태 점검 실패: ${error}`);
      
      const errorStatus = {
        server: {
          initialized: false,
          error: (error as Error).toString(),
          uptime: process.uptime(),
          pid: process.pid
        },
        health: {
          healthy: false,
          issues: [`Health check failed: ${error}`]
        },
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(errorStatus, null, 2) }]
      };
    }
  }

  /**
   * 캐시 통계 조회 도구 처리
   */
  async handleGetCacheStats(): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const searchCache = this.stateManager.searchCache!;

    console.error(`[DEBUG] 캐시 통계 요청`);

    try {
      const cacheStats = searchCache.getStats();
      
      const response = {
        cache: {
          ...cacheStats,
          hitRate: cacheStats.hits > 0 ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(2) + '%' : '0%'
        },
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 캐시 통계 반환: ${cacheStats.size}개 항목, ${response.cache.hitRate} 적중률`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 캐시 통계 조회 실패: ${error}`);
      throw new Error(`캐시 통계 조회 실패: ${error}`);
    }
  }

  /**
   * 검색 분석 조회 도구 처리
   */
  async handleGetSearchAnalytics(args: any): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const analyticsService = this.stateManager.analyticsService!;

    const timeRange = args.timeRange as string | undefined;
    const domain = args.domain as string | undefined;

    console.error(`[DEBUG] 검색 분석 요청: timeRange=${timeRange}, domain=${domain}`);

    try {
      const analytics = await analyticsService.getSearchAnalytics(24); // 24시간
      
      const response = {
        analytics,
        filters: {
          timeRange: timeRange || 'all',
          domain: domain || 'all'
        },
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 검색 분석 반환: ${analytics.totalQueries}회 검색`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 검색 분석 조회 실패: ${error}`);
      throw new Error(`검색 분석 조회 실패: ${error}`);
    }
  }

  /**
   * 시스템 메트릭 조회 도구 처리
   */
  async handleGetSystemMetrics(): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    console.error(`[DEBUG] 시스템 메트릭 요청`);

    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // 메모리 사용량을 MB 단위로 변환
      const formatMemory = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;

      const metrics: any = {
        system: {
          uptime: process.uptime(),
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        },
        memory: {
          rss: formatMemory(memoryUsage.rss),
          heapTotal: formatMemory(memoryUsage.heapTotal),
          heapUsed: formatMemory(memoryUsage.heapUsed),
          external: formatMemory(memoryUsage.external),
          arrayBuffers: formatMemory(memoryUsage.arrayBuffers),
          unit: 'MB'
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          unit: 'microseconds'
        },
        timestamp: new Date().toISOString()
      };

      // 추가 메트릭 (사용 가능한 경우)
      if (this.stateManager.repository?.isInitialized()) {
        const stats = this.stateManager.repository.getStatistics();
        metrics['repository'] = stats;
      }

      if (this.stateManager.searchCache) {
        const cacheStats = this.stateManager.searchCache.getStats();
        metrics['cache'] = cacheStats;
      }

      console.error(`[DEBUG] 시스템 메트릭 반환: ${formatMemory(memoryUsage.heapUsed)}MB 힙 사용`);

      return {
        content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 시스템 메트릭 조회 실패: ${error}`);
      throw new Error(`시스템 메트릭 조회 실패: ${error}`);
    }
  }
}
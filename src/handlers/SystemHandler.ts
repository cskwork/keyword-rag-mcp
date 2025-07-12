import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { ServerStateManager } from '../server/ServerStateManager.js';

/**
 * 간소화된 시스템 핸들러
 */
export class SystemHandler {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * 간소화된 상태 점검
   */
  async handleHealthCheck(): Promise<{ content: TextContent[] }> {
    console.error(`[DEBUG] 상태 점검 요청`);

    try {
      const servicesStatus = this.stateManager.getServicesStatus();
      const repository = this.stateManager.repository;

      // 기본 서비스 상태
      const status = {
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
        (status as any)['repository'] = {
          ...stats,
          healthy: stats.totalDocuments > 0
        };
      }

      // 전체 상태 결정 (간소화됨)
      const overallStatus = servicesStatus.isInitialized && repository?.isInitialized() 
        ? 'healthy' 
        : 'initializing';

      const response = {
        status: overallStatus,
        details: status
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 상태 점검 실패: ${error}`);
      
      const errorResponse = {
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }]
      };
    }
  }

  /**
   * 간소화된 통계 조회
   */
  async handleGetStatistics(): Promise<{ content: TextContent[] }> {
    console.error(`[DEBUG] 통계 조회 요청`);

    try {
      const repository = this.stateManager.repository;
      
      if (!repository?.isInitialized()) {
        throw new Error('저장소가 초기화되지 않았습니다');
      }

      const stats = repository.getStatistics();
      const systemInfo = {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version
      };

      const response = {
        repository: stats,
        system: systemInfo,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 통계 조회 실패: ${error}`);
      throw new Error(`통계 조회 실패: ${error}`);
    }
  }

  /**
   * 도메인 목록 조회
   */
  async handleListDomains(): Promise<{ content: TextContent[] }> {
    console.error(`[DEBUG] 도메인 목록 조회 요청`);

    try {
      const repository = this.stateManager.repository;
      
      if (!repository?.isInitialized()) {
        throw new Error('저장소가 초기화되지 않았습니다');
      }

      const stats = repository.getStatistics();
      const domains = stats.domains.map(domain => ({
        name: domain.name,
        documentCount: domain.documentCount,
        category: '일반문서' // 간소화됨
      }));

      const response = {
        domains,
        totalDomains: domains.length,
        totalDocuments: stats.totalDocuments,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 도메인 목록 조회 실패: ${error}`);
      throw new Error(`도메인 목록 조회 실패: ${error}`);
    }
  }
}
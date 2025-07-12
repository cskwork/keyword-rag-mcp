import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 검색 쿼리 정보
 */
export interface SearchQuery {
  id: string;
  timestamp: Date;
  keywords: string[];
  domain?: string;
  topN: number;
  resultCount: number;
  responseTime: number; // 밀리초
  cacheHit: boolean;
  userId?: string;
  sessionId?: string;
}

/**
 * 도메인별 검색 통계
 */
export interface DomainSearchStats {
  domain: string;
  queryCount: number;
  avgResponseTime: number;
  cacheHitRate: number;
  popularKeywords: { keyword: string; count: number }[];
}

/**
 * 시간대별 검색 통계
 */
export interface TimeBasedStats {
  hour: number;
  queryCount: number;
  avgResponseTime: number;
}

/**
 * 검색 분석 결과
 */
export interface SearchAnalytics {
  totalQueries: number;
  avgResponseTime: number;
  cacheHitRate: number;
  topDomains: DomainSearchStats[];
  topKeywords: { keyword: string; count: number }[];
  timeBasedStats: TimeBasedStats[];
  queriesByDate: { date: string; count: number }[];
  performanceMetrics: {
    p50ResponseTime: number;
    p90ResponseTime: number;
    p99ResponseTime: number;
    slowestQueries: SearchQuery[];
  };
}

/**
 * 사용자 활동 통계
 */
export interface UserStats {
  totalUsers: number;
  activeUsers: number; // 최근 24시간
  avgQueriesPerUser: number;
  topUsers: { userId: string; queryCount: number }[];
}

/**
 * 시스템 성능 메트릭
 */
export interface SystemMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  documentStats: {
    totalDocuments: number;
    totalChunks: number;
    avgDocumentSize: number;
  };
  cacheStats: {
    size: number;
    hitRate: number;
    evictionCount: number;
  };
  uptime: number;
}

/**
 * 검색 분석 및 메트릭 서비스
 */
export class AnalyticsService {
  private searchQueries: SearchQuery[] = [];
  private analyticsFile: string;
  private readonly maxStoredQueries = 10000; // 메모리에 저장할 최대 쿼리 수
  private startTime: Date;

  constructor(analyticsDir?: string) {
    this.startTime = new Date();
    const defaultDir = path.join(os.tmpdir(), 'mcp-knowledge-retrieval');
    const dir = analyticsDir || defaultDir;
    
    // 디렉토리 생성
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.analyticsFile = path.join(dir, 'search-analytics.json');
    this.loadExistingData();
  }

  /**
   * 기존 분석 데이터 로드
   */
  private async loadExistingData(): Promise<void> {
    try {
      if (fs.existsSync(this.analyticsFile)) {
        const data = await fs.promises.readFile(this.analyticsFile, 'utf-8');
        const parsedData = JSON.parse(data);
        
        if (Array.isArray(parsedData.queries)) {
          this.searchQueries = parsedData.queries.map((q: any) => ({
            ...q,
            timestamp: new Date(q.timestamp)
          }));
          
          // 메모리 사용량 제한
          if (this.searchQueries.length > this.maxStoredQueries) {
            this.searchQueries = this.searchQueries.slice(-this.maxStoredQueries);
          }
          
          // 테스트 환경이 아닐 때만 로깅
          if (process.env.NODE_ENV !== 'test') {
            console.error(`[DEBUG] Loaded ${this.searchQueries.length} search queries from analytics file`);
          }
        }
      }
    } catch (error) {
      // 테스트 환경이 아닐 때만 로깅
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[DEBUG] Failed to load analytics data: ${(error as Error).message}`);
      }
    }
  }

  /**
   * 분석 데이터 저장
   */
  private async saveData(): Promise<void> {
    try {
      const data = {
        queries: this.searchQueries.slice(-this.maxStoredQueries), // 최근 데이터만 저장
        lastUpdated: new Date().toISOString()
      };
      
      await fs.promises.writeFile(this.analyticsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`[DEBUG] Failed to save analytics data: ${(error as Error).message}`);
    }
  }

  /**
   * 검색 쿼리 기록
   */
  async recordSearchQuery(
    keywords: string[],
    domain: string | undefined,
    topN: number,
    resultCount: number,
    responseTime: number,
    cacheHit: boolean,
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    const query: SearchQuery = {
      id: this.generateQueryId(),
      timestamp: new Date(),
      keywords,
      domain,
      topN,
      resultCount,
      responseTime,
      cacheHit,
      userId,
      sessionId
    };

    this.searchQueries.push(query);

    // 메모리 사용량 제한
    if (this.searchQueries.length > this.maxStoredQueries) {
      this.searchQueries = this.searchQueries.slice(-this.maxStoredQueries);
    }

    // 주기적으로 디스크에 저장 (매 10번째 쿼리마다)
    if (this.searchQueries.length % 10 === 0) {
      await this.saveData();
    }
  }

  /**
   * 쿼리 ID 생성
   */
  private generateQueryId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 검색 분석 결과 생성
   */
  async getSearchAnalytics(timeRangeHours: number = 24): Promise<SearchAnalytics> {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentQueries = this.searchQueries.filter(q => q.timestamp >= cutoffTime);

    if (recentQueries.length === 0) {
      return this.getEmptyAnalytics();
    }

    // 기본 통계
    const totalQueries = recentQueries.length;
    const avgResponseTime = recentQueries.reduce((sum, q) => sum + q.responseTime, 0) / totalQueries;
    const cacheHits = recentQueries.filter(q => q.cacheHit).length;
    const cacheHitRate = cacheHits / totalQueries;

    // 도메인별 통계
    const domainStats = this.calculateDomainStats(recentQueries);

    // 키워드 통계
    const keywordStats = this.calculateKeywordStats(recentQueries);

    // 시간대별 통계
    const timeStats = this.calculateTimeBasedStats(recentQueries);

    // 날짜별 쿼리 수
    const dateStats = this.calculateDateStats(recentQueries);

    // 성능 메트릭
    const performanceMetrics = this.calculatePerformanceMetrics(recentQueries);

    return {
      totalQueries,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      topDomains: domainStats,
      topKeywords: keywordStats,
      timeBasedStats: timeStats,
      queriesByDate: dateStats,
      performanceMetrics
    };
  }

  /**
   * 사용자 통계 생성
   */
  getUserStats(timeRangeHours: number = 24): UserStats {
    const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentQueries = this.searchQueries.filter(q => 
      q.timestamp >= cutoffTime && q.userId
    );

    const userQueryCounts: { [userId: string]: number } = {};
    
    recentQueries.forEach(q => {
      if (q.userId) {
        userQueryCounts[q.userId] = (userQueryCounts[q.userId] || 0) + 1;
      }
    });

    const userIds = Object.keys(userQueryCounts);
    const totalUsers = userIds.length;
    const totalQueries = Object.values(userQueryCounts).reduce((sum, count) => sum + count, 0);
    const avgQueriesPerUser = totalUsers > 0 ? totalQueries / totalUsers : 0;

    const topUsers = Object.entries(userQueryCounts)
      .map(([userId, count]) => ({ userId, queryCount: count }))
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, 10);

    return {
      totalUsers,
      activeUsers: totalUsers, // 현재는 모든 사용자가 활성 사용자
      avgQueriesPerUser: Math.round(avgQueriesPerUser * 100) / 100,
      topUsers
    };
  }

  /**
   * 시스템 메트릭 생성
   */
  getSystemMetrics(documentCount: number, chunkCount: number, cacheStats?: any): SystemMetrics {
    const memUsage = process.memoryUsage();
    const uptime = Math.max(0, Math.floor((Date.now() - this.startTime.getTime()) / 1000));

    return {
      memoryUsage: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      documentStats: {
        totalDocuments: documentCount,
        totalChunks: chunkCount,
        avgDocumentSize: chunkCount > 0 ? Math.round((chunkCount / documentCount) * 100) / 100 : 0
      },
      cacheStats: cacheStats ? {
        size: cacheStats.size || 0,
        hitRate: Math.round((cacheStats.hitRate || 0) * 100) / 100,
        evictionCount: cacheStats.evictions || 0
      } : {
        size: 0,
        hitRate: 0,
        evictionCount: 0
      },
      uptime
    };
  }

  /**
   * 도메인별 통계 계산
   */
  private calculateDomainStats(queries: SearchQuery[]): DomainSearchStats[] {
    const domainData: { [domain: string]: {
      count: number;
      totalResponseTime: number;
      cacheHits: number;
      keywords: string[];
    }} = {};

    queries.forEach(q => {
      const domain = q.domain || 'unknown';
      if (!domainData[domain]) {
        domainData[domain] = {
          count: 0,
          totalResponseTime: 0,
          cacheHits: 0,
          keywords: []
        };
      }

      domainData[domain].count++;
      domainData[domain].totalResponseTime += q.responseTime;
      if (q.cacheHit) domainData[domain].cacheHits++;
      domainData[domain].keywords.push(...q.keywords);
    });

    return Object.entries(domainData)
      .map(([domain, data]) => ({
        domain,
        queryCount: data.count,
        avgResponseTime: Math.round((data.totalResponseTime / data.count) * 100) / 100,
        cacheHitRate: Math.round((data.cacheHits / data.count) * 100) / 100,
        popularKeywords: this.getTopKeywords(data.keywords, 5)
      }))
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, 10);
  }

  /**
   * 키워드 통계 계산
   */
  private calculateKeywordStats(queries: SearchQuery[]): { keyword: string; count: number }[] {
    const allKeywords = queries.flatMap(q => q.keywords);
    return this.getTopKeywords(allKeywords, 20);
  }

  /**
   * 상위 키워드 추출
   */
  private getTopKeywords(keywords: string[], limit: number): { keyword: string; count: number }[] {
    const keywordCounts: { [keyword: string]: number } = {};
    
    keywords.forEach(keyword => {
      const normalized = keyword.toLowerCase().trim();
      if (normalized.length > 1) { // 1글자 키워드 제외
        keywordCounts[normalized] = (keywordCounts[normalized] || 0) + 1;
      }
    });

    return Object.entries(keywordCounts)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 시간대별 통계 계산
   */
  private calculateTimeBasedStats(queries: SearchQuery[]): TimeBasedStats[] {
    const hourlyData: { [hour: number]: {
      count: number;
      totalResponseTime: number;
    }} = {};

    // 0-23시 초기화
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = { count: 0, totalResponseTime: 0 };
    }

    queries.forEach(q => {
      const hour = q.timestamp.getUTCHours();
      hourlyData[hour].count++;
      hourlyData[hour].totalResponseTime += q.responseTime;
    });

    return Object.entries(hourlyData)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        queryCount: data.count,
        avgResponseTime: data.count > 0 ? 
          Math.round((data.totalResponseTime / data.count) * 100) / 100 : 0
      }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * 날짜별 통계 계산
   */
  private calculateDateStats(queries: SearchQuery[]): { date: string; count: number }[] {
    const dateData: { [date: string]: number } = {};

    queries.forEach(q => {
      const date = q.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      dateData[date] = (dateData[date] || 0) + 1;
    });

    return Object.entries(dateData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 성능 메트릭 계산
   */
  private calculatePerformanceMetrics(queries: SearchQuery[]): SearchAnalytics['performanceMetrics'] {
    const responseTimes = queries.map(q => q.responseTime).sort((a, b) => a - b);
    
    // 백분위수 계산 함수
    const getPercentile = (arr: number[], percentile: number): number => {
      if (arr.length === 0) return 0;
      if (arr.length === 1) return arr[0];
      
      const index = (arr.length - 1) * percentile;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      
      if (lower === upper) {
        return arr[lower];
      }
      
      const weight = index - lower;
      return arr[lower] * (1 - weight) + arr[upper] * weight;
    };

    const slowestQueries = queries
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 3); // 상위 3개만 반환

    return {
      p50ResponseTime: getPercentile(responseTimes, 0.5),
      p90ResponseTime: getPercentile(responseTimes, 0.9),
      p99ResponseTime: getPercentile(responseTimes, 0.99),
      slowestQueries
    };
  }

  /**
   * 빈 분석 결과 반환
   */
  private getEmptyAnalytics(): SearchAnalytics {
    return {
      totalQueries: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      topDomains: [],
      topKeywords: [],
      timeBasedStats: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        queryCount: 0,
        avgResponseTime: 0
      })),
      queriesByDate: [],
      performanceMetrics: {
        p50ResponseTime: 0,
        p90ResponseTime: 0,
        p99ResponseTime: 0,
        slowestQueries: []
      }
    };
  }

  /**
   * 분석 데이터 강제 저장
   */
  async flushData(): Promise<void> {
    await this.saveData();
  }

  /**
   * 분석 데이터 초기화
   */
  async clearData(): Promise<void> {
    this.searchQueries = [];
    await this.saveData();
  }

  /**
   * 현재 저장된 쿼리 수
   */
  getStoredQueryCount(): number {
    return this.searchQueries.length;
  }
}
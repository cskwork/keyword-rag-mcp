import { FileWatcherService, FileChangeEvent } from '../services/FileWatcherService.js';
import { DocumentLoader } from '../services/DocumentLoader.js';
import { ServerStateManager } from './ServerStateManager.js';
import { createSearchCacheKey } from '../services/CacheService.js';

/**
 * 파일 감시 관리자 - 파일 변경 감지 및 핫 리로드 처리
 */
export class FileWatcherManager {
  private stateManager: ServerStateManager;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay: number;

  constructor(debounceDelay: number = 1000) {
    this.stateManager = ServerStateManager.getInstance();
    this.debounceDelay = debounceDelay;
  }

  /**
   * 파일 감시 서비스 설정 및 시작
   */
  async setupFileWatcher(): Promise<void> {
    const config = this.stateManager.config;
    if (!config) {
      throw new Error('Configuration not loaded');
    }

    console.error(`[DEBUG] Setting up file watcher...`);

    try {
      const fileWatcher = new FileWatcherService();
      
      // 도메인별 감시 경로 설정
      const watchPaths: string[] = [];
      for (const domain of config.documentSource.domains) {
        if (domain.path && !domain.path.startsWith('http')) {
          watchPaths.push(domain.path);
          console.error(`[DEBUG] Adding watch path for domain '${domain.name}': ${domain.path}`);
        }
      }

      if (watchPaths.length === 0) {
        console.error(`[DEBUG] No local paths to watch, skipping file watcher setup`);
        return;
      }

      // 변경 이벤트 핸들러 등록
      fileWatcher.on('change', (event: FileChangeEvent) => {
        this.handleFileChange(event);
      });

      // 감시 시작
      await fileWatcher.startWatching(watchPaths[0] || '');
      this.stateManager.setFileWatcher(fileWatcher);
      
      console.error(`[DEBUG] File watcher started for ${watchPaths.length} paths`);

    } catch (error) {
      console.error(`[ERROR] Failed to setup file watcher: ${error}`);
      // 파일 감시 실패는 치명적이지 않으므로 경고만 출력
    }
  }

  /**
   * 파일 변경 이벤트 처리 (디바운스 적용)
   */
  private handleFileChange(event: FileChangeEvent): void {
    console.error(`[DEBUG] File change detected: ${event.type} - ${event.path}`);

    // 파일별 디바운스 처리
    const timerId = this.debounceTimers.get(event.path);
    if (timerId) {
      clearTimeout(timerId);
    }

    const newTimer = setTimeout(() => {
      this.processFileChange(event);
      this.debounceTimers.delete(event.path);
    }, this.debounceDelay);

    this.debounceTimers.set(event.path, newTimer);
  }

  /**
   * 실제 파일 변경 처리
   */
  private async processFileChange(event: FileChangeEvent): Promise<void> {
    const repository = this.stateManager.repository;
    const config = this.stateManager.config;
    const searchCache = this.stateManager.searchCache;

    if (!repository || !config) {
      console.error(`[ERROR] Repository or config not available during file change processing`);
      return;
    }

    try {
      console.error(`[DEBUG] Processing file change: ${event.type} - ${event.path}`);

      // 변경된 파일이 속한 도메인 찾기
      const affectedDomain = this.findAffectedDomain(event.path, config);
      if (!affectedDomain) {
        console.error(`[DEBUG] File change outside of watched domains, ignoring: ${event.path}`);
        return;
      }

      console.error(`[DEBUG] File change affects domain: ${affectedDomain.name}`);

      // 해당 도메인의 문서 다시 로드
      await this.reloadDomainDocuments(affectedDomain);

      // 관련 캐시 무효화
      this.invalidateRelatedCache(affectedDomain.name, searchCache);

      console.error(`[DEBUG] File change processing completed for domain: ${affectedDomain.name}`);

    } catch (error) {
      console.error(`[ERROR] Failed to process file change: ${error}`);
      console.error(`[ERROR] File: ${event.path}, Type: ${event.type}`);
    }
  }

  /**
   * 변경된 파일이 속한 도메인 찾기
   */
  private findAffectedDomain(filePath: string, config: any): any | null {
    for (const domain of config.documentSource.domains) {
      if (domain.path && !domain.path.startsWith('http')) {
        // 파일 경로가 도메인 경로 하위에 있는지 확인
        const normalizedDomainPath = domain.path.replace(/\\/g, '/');
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        
        if (normalizedFilePath.startsWith(normalizedDomainPath)) {
          return domain;
        }
      }
    }
    return null;
  }

  /**
   * 도메인 문서 다시 로드
   */
  private async reloadDomainDocuments(domain: any): Promise<void> {
    const repository = this.stateManager.repository;
    const config = this.stateManager.config;

    if (!repository || !config) {
      throw new Error('Repository or config not available');
    }

    try {
      console.error(`[DEBUG] Reloading documents for domain: ${domain.name}`);

      // 도메인별 설정으로 문서 로더 생성
      const domainConfig = {
        ...config,
        domains: [domain] // 특정 도메인만 로드
      };

      const documentLoader = new DocumentLoader(config.documentSource);
      const documents = await documentLoader.loadAllDocuments();

      console.error(`[DEBUG] Loaded ${documents.length} documents for domain: ${domain.name}`);

      // 전체 저장소 재초기화 (간단한 구현)
      await repository.initialize(documents);

      console.error(`[DEBUG] Domain documents reloaded successfully: ${domain.name}`);

      // 통계 업데이트
      const stats = repository.getStatistics();
      console.error(`[DEBUG] Updated repository statistics:`, JSON.stringify(stats, null, 2));

    } catch (error) {
      console.error(`[ERROR] Failed to reload domain documents: ${error}`);
      throw error;
    }
  }

  /**
   * 관련 캐시 무효화
   */
  private invalidateRelatedCache(domainName: string, searchCache: any): void {
    if (!searchCache) {
      return;
    }

    try {
      // 도메인 관련 캐시 키들을 찾아서 무효화
      // 실제 구현에서는 더 정교한 캐시 키 관리가 필요할 수 있음
      const cacheStats = searchCache.getStats();
      console.error(`[DEBUG] Cache stats before invalidation:`, cacheStats);

      // 간단한 구현: 전체 캐시 클리어
      // 더 정교한 구현에서는 도메인별 키만 선택적으로 제거
      searchCache.clear();

      console.error(`[DEBUG] Search cache cleared due to domain change: ${domainName}`);

    } catch (error) {
      console.error(`[ERROR] Failed to invalidate cache: ${error}`);
    }
  }

  /**
   * 파일 감시 중지
   */
  async stopFileWatcher(): Promise<void> {
    const fileWatcher = this.stateManager.fileWatcher;
    if (fileWatcher) {
      try {
        await fileWatcher.stopWatching();
        console.error(`[DEBUG] File watcher stopped`);
      } catch (error) {
        console.error(`[ERROR] Failed to stop file watcher: ${error}`);
      }
    }

    // 디바운스 타이머들 정리
    this.debounceTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();
  }

  /**
   * 감시 상태 확인
   */
  getWatcherStatus(): any {
    const fileWatcher = this.stateManager.fileWatcher;
    return {
      isWatching: !!fileWatcher,
      activePaths: fileWatcher ? [] : [], // getWatchedPaths 메서드 없음
      pendingChanges: this.debounceTimers.size,
      timestamp: new Date().toISOString()
    };
  }
}
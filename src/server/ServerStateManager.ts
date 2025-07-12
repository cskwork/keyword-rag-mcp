import { DocumentRepository } from '../services/DocumentRepository.js';
import { FileWatcherService } from '../services/FileWatcherService.js';
import { CacheService } from '../services/CacheService.js';
import { ValidationService } from '../services/ValidationService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';

/**
 * 서버 상태 관리자 - 전역 상태 및 서비스 인스턴스 관리
 */
export class ServerStateManager {
  private static instance: ServerStateManager;
  
  // 서비스 인스턴스들
  private _repository: DocumentRepository | null = null;
  private _config: any = null;
  private _fileWatcher: FileWatcherService | null = null;
  private _searchCache: CacheService<any> | null = null;
  private _validationService: ValidationService | null = null;
  private _analyticsService: AnalyticsService | null = null;
  
  // 상태 플래그들
  private _isInitialized = false;
  private _isInitializing = false;

  private constructor() {
    console.error(`[DEBUG] ServerStateManager instance created at ${new Date().toISOString()}`);
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): ServerStateManager {
    if (!ServerStateManager.instance) {
      ServerStateManager.instance = new ServerStateManager();
    }
    return ServerStateManager.instance;
  }

  // Getters
  get repository(): DocumentRepository | null {
    return this._repository;
  }

  get config(): any {
    return this._config;
  }

  get fileWatcher(): FileWatcherService | null {
    return this._fileWatcher;
  }

  get searchCache(): CacheService<any> | null {
    return this._searchCache;
  }

  get validationService(): ValidationService | null {
    return this._validationService;
  }

  get analyticsService(): AnalyticsService | null {
    return this._analyticsService;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  // Setters
  setRepository(repository: DocumentRepository): void {
    this._repository = repository;
    console.error(`[DEBUG] Repository set in StateManager`);
  }

  setConfig(config: any): void {
    this._config = config;
    console.error(`[DEBUG] Config set in StateManager`);
  }

  setFileWatcher(fileWatcher: FileWatcherService): void {
    this._fileWatcher = fileWatcher;
    console.error(`[DEBUG] FileWatcher set in StateManager`);
  }

  setSearchCache(searchCache: CacheService<any>): void {
    this._searchCache = searchCache;
    console.error(`[DEBUG] SearchCache set in StateManager`);
  }

  setValidationService(validationService: ValidationService): void {
    this._validationService = validationService;
    console.error(`[DEBUG] ValidationService set in StateManager`);
  }

  setAnalyticsService(analyticsService: AnalyticsService): void {
    this._analyticsService = analyticsService;
    console.error(`[DEBUG] AnalyticsService set in StateManager`);
  }

  setInitializing(isInitializing: boolean): void {
    this._isInitializing = isInitializing;
    console.error(`[DEBUG] Initializing state set to: ${isInitializing}`);
  }

  setInitialized(isInitialized: boolean): void {
    this._isInitialized = isInitialized;
    console.error(`[DEBUG] Initialized state set to: ${isInitialized}`);
  }

  /**
   * 서버 준비 상태 확인
   */
  async ensureServerReady(): Promise<void> {
    if (this._isInitialized && this._repository?.isInitialized()) {
      return;
    }

    if (this._isInitializing) {
      // 초기화가 진행 중이면 완료될 때까지 대기
      console.error(`[DEBUG] Server initializing, waiting...`);
      let attempts = 0;
      const maxAttempts = 30; // 30초 대기
      
      while (this._isInitializing && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        console.error(`[DEBUG] Waiting for initialization... (${attempts}/${maxAttempts})`);
      }
      
      if (this._isInitializing) {
        throw new Error('Server initialization timeout');
      }
    }

    if (!this._isInitialized || !this._repository?.isInitialized()) {
      throw new Error('Server not properly initialized');
    }
  }

  /**
   * 모든 서비스 상태 확인
   */
  getServicesStatus(): any {
    return {
      repository: !!this._repository && this._repository.isInitialized(),
      config: !!this._config,
      fileWatcher: !!this._fileWatcher,
      searchCache: !!this._searchCache,
      validationService: !!this._validationService,
      analyticsService: !!this._analyticsService,
      isInitialized: this._isInitialized,
      isInitializing: this._isInitializing,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 상태 초기화 (테스트용)
   */
  reset(): void {
    this._repository = null;
    this._config = null;
    this._fileWatcher = null;
    this._searchCache = null;
    this._validationService = null;
    this._analyticsService = null;
    this._isInitialized = false;
    this._isInitializing = false;
    console.error(`[DEBUG] ServerStateManager reset`);
  }
}
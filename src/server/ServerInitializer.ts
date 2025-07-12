import { loadConfig } from '../config/config.js';
import { DocumentLoader } from '../services/DocumentLoader.js';
import { DocumentRepository } from '../services/DocumentRepository.js';
import { CacheService } from '../services/CacheService.js';
import { ValidationService } from '../services/ValidationService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { ServerStateManager } from './ServerStateManager.js';

/**
 * 서버 초기화 관리자 - 모든 서비스 초기화 및 설정 로드
 */
export class ServerInitializer {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * MCP 서버 초기화 메인 프로세스
   */
  async initializeServer(): Promise<void> {
    console.error(`[DEBUG] initializeServer() started, isInitialized=${this.stateManager.isInitialized}, isInitializing=${this.stateManager.isInitializing}`);
    
    // 이미 초기화된 경우 스킵
    if (this.stateManager.isInitialized && this.stateManager.repository?.isInitialized()) {
      console.error(`[DEBUG] Already initialized, skipping. Repository has ${this.stateManager.repository.getStatistics().totalDocuments} documents`);
      return;
    }
    
    // 초기화 진행 중인 경우 대기
    if (this.stateManager.isInitializing) {
      console.error(`[DEBUG] Already initializing, waiting...`);
      await this.waitForInitialization();
      return;
    }

    this.stateManager.setInitializing(true);

    try {
      console.error(`[DEBUG] Starting server initialization...`);
      
      // 1. 설정 로드
      await this.loadConfiguration();
      
      // 2. 서비스 초기화
      await this.initializeServices();
      
      // 3. 문서 로드 및 인덱싱
      await this.loadAndIndexDocuments();
      
      // 4. 검증
      await this.validateInitialization();
      
      this.stateManager.setInitialized(true);
      console.error(`[DEBUG] Server initialization completed successfully`);
      
    } catch (error) {
      console.error(`[ERROR] Server initialization failed: ${error}`);
      this.stateManager.setInitialized(false);
      throw error;
    } finally {
      this.stateManager.setInitializing(false);
    }
  }

  /**
   * 설정 로드
   */
  private async loadConfiguration(): Promise<void> {
    console.error(`[DEBUG] Loading configuration...`);
    
    try {
      const config = await loadConfig();
      this.stateManager.setConfig(config);
      console.error(`[DEBUG] Configuration loaded successfully`);
      console.error(`[DEBUG] Base path: ${config.documentSource.basePath}`);
      console.error(`[DEBUG] Auto discover: ${config.documentSource.autoDiscovery}`);
      console.error(`[DEBUG] Domains count: ${config.documentSource.domains.length}`);
    } catch (error) {
      console.error(`[ERROR] Failed to load configuration: ${error}`);
      throw new Error(`Configuration loading failed: ${error}`);
    }
  }

  /**
   * 서비스 초기화
   */
  private async initializeServices(): Promise<void> {
    console.error(`[DEBUG] Initializing services...`);
    
    const config = this.stateManager.config;
    if (!config) {
      throw new Error('Configuration not loaded');
    }

    try {
      // 캐시 서비스 초기화
      const searchCache = new CacheService<any>(
        config.cache?.maxSize || 500
      );
      this.stateManager.setSearchCache(searchCache);
      console.error(`[DEBUG] Search cache initialized with max size: ${config.cache?.maxSize || 500}`);

      // 검증 서비스 초기화  
      const validationService = new ValidationService();
      this.stateManager.setValidationService(validationService);
      console.error(`[DEBUG] Validation service initialized`);

      // 분석 서비스 초기화
      const analyticsService = new AnalyticsService();
      this.stateManager.setAnalyticsService(analyticsService);
      console.error(`[DEBUG] Analytics service initialized`);

      // 문서 저장소 초기화
      const repository = new DocumentRepository();
      this.stateManager.setRepository(repository);
      console.error(`[DEBUG] Document repository initialized`);

    } catch (error) {
      console.error(`[ERROR] Failed to initialize services: ${error}`);
      throw new Error(`Service initialization failed: ${error}`);
    }
  }

  /**
   * 문서 로드 및 인덱싱
   */
  private async loadAndIndexDocuments(): Promise<void> {
    console.error(`[DEBUG] Loading and indexing documents...`);
    
    const config = this.stateManager.config;
    const repository = this.stateManager.repository;
    
    if (!config || !repository) {
      throw new Error('Configuration or repository not initialized');
    }

    try {
      const documentLoader = new DocumentLoader(config.documentSource);
      const documents = await documentLoader.loadAllDocuments();
      
      console.error(`[DEBUG] Loaded ${documents.length} documents from ${config.documentSource.domains.length} domains`);

      // 도메인별 로드 상황 출력
      const domainCounts = new Map<string, number>();
      documents.forEach((doc: any) => {
        const count = domainCounts.get(doc.domainName || 'general') || 0;
        domainCounts.set(doc.domainName || 'general', count + 1);
      });

      domainCounts.forEach((count, domain) => {
        console.error(`[DEBUG] Domain '${domain}': ${count} documents`);
      });

      // 문서 인덱싱
      await repository.initialize(documents);
      console.error(`[DEBUG] Documents indexed successfully`);

      // 통계 정보 출력
      const stats = repository.getStatistics();
      console.error(`[DEBUG] Repository statistics:`, JSON.stringify(stats, null, 2));

    } catch (error) {
      console.error(`[ERROR] Failed to load and index documents: ${error}`);
      throw new Error(`Document loading failed: ${error}`);
    }
  }

  /**
   * 초기화 검증
   */
  private async validateInitialization(): Promise<void> {
    console.error(`[DEBUG] Validating initialization...`);
    
    const repository = this.stateManager.repository;
    const validationService = this.stateManager.validationService;
    
    if (!repository || !validationService) {
      throw new Error('Services not properly initialized');
    }

    try {
      // 저장소 검증
      if (!repository.isInitialized()) {
        throw new Error('Repository not initialized');
      }

      const stats = repository.getStatistics();
      if (stats.totalDocuments === 0) {
        console.error(`[WARNING] No documents loaded. Check document paths and permissions.`);
      }

      // 서비스 상태 검증
      const healthCheck = await validationService.performHealthCheck();
      
      if (healthCheck.status !== 'healthy') {
        console.error(`[WARNING] System health check: ${healthCheck.status}`);
      }

      console.error(`[DEBUG] Initialization validation passed`);

    } catch (error) {
      console.error(`[ERROR] Initialization validation failed: ${error}`);
      throw error;
    }
  }

  /**
   * 초기화 완료 대기
   */
  private async waitForInitialization(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30; // 30초 대기
    
    while (this.stateManager.isInitializing && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      console.error(`[DEBUG] Waiting for initialization... (${attempts}/${maxAttempts})`);
    }
    
    if (this.stateManager.isInitializing) {
      throw new Error('Initialization timeout');
    }
    
    if (!this.stateManager.isInitialized) {
      throw new Error('Initialization failed');
    }
  }
}
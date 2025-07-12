import { loadConfig } from '../config/config.js';
import { DocumentLoader } from '../services/DocumentLoader.js';
import { DocumentRepository } from '../services/DocumentRepository.js';
import { ServerStateManager } from './ServerStateManager.js';

/**
 * 간소화된 서버 초기화 관리자 - 필수 서비스만 초기화
 */
export class ServerInitializer {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * 간소화된 MCP 서버 초기화
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
      
      // 1. 설정 로드 (자동 config.json 생성 포함)
      await this.loadConfiguration();
      
      // 2. 문서 저장소 초기화
      await this.initializeRepository();
      
      // 3. 문서 로드 및 인덱싱
      await this.loadAndIndexDocuments();
      
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
   * 설정 로드 (자동 생성 포함)
   */
  private async loadConfiguration(): Promise<void> {
    console.error(`[DEBUG] Loading configuration...`);
    
    try {
      const config = await loadConfig(); // 자동으로 config.json 생성됨
      this.stateManager.setConfig(config);
      console.error(`[DEBUG] Configuration loaded successfully`);
      console.error(`[DEBUG] Base path: ${config.documentSource.basePath}`);
      console.error(`[DEBUG] Auto discovery: ${config.documentSource.autoDiscovery}`);
      console.error(`[DEBUG] Domains count: ${config.documentSource.domains.length}`);
    } catch (error) {
      console.error(`[ERROR] Failed to load configuration: ${error}`);
      throw new Error(`Configuration loading failed: ${error}`);
    }
  }

  /**
   * 문서 저장소 초기화 (단순화됨)
   */
  private async initializeRepository(): Promise<void> {
    console.error(`[DEBUG] Initializing document repository...`);
    
    try {
      const repository = new DocumentRepository();
      this.stateManager.setRepository(repository);
      console.error(`[DEBUG] Document repository initialized`);
    } catch (error) {
      console.error(`[ERROR] Failed to initialize repository: ${error}`);
      throw new Error(`Repository initialization failed: ${error}`);
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
      console.error(`[DEBUG] Repository statistics: Documents=${stats.totalDocuments}, Chunks=${stats.totalChunks}, Domains=${stats.domains.length}`);

      if (stats.totalDocuments === 0) {
        console.error(`[WARNING] No documents loaded. Check document paths and permissions.`);
      }

    } catch (error) {
      console.error(`[ERROR] Failed to load and index documents: ${error}`);
      throw new Error(`Document loading failed: ${error}`);
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
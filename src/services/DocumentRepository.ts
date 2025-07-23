import { BM25Calculator, escapeRegExp, type SearchResult, type DocumentChunk } from '../utils/bm25.js';
import { KnowledgeDocument } from '../models/Document.js';

/**
 * 문서 저장소
 * BM25 알고리즘을 사용하여 문서를 검색하고 관리
 */
export class DocumentRepository {
  private readonly instanceId: string = `repo-${Date.now()}-${Math.random()}`;
  private readonly documents: Map<number, KnowledgeDocument> = new Map();
  private readonly domainCalculators: Map<string, BM25Calculator> = new Map();
  private globalCalculator: BM25Calculator | null = null;
  private initialized: boolean = false;
  private initializing: boolean = false;

  constructor() {
  }

  /**
   * 비동기로 Repository 초기화
   * @param documents 로드된 문서 배열
   */
  async initialize(documents: KnowledgeDocument[]): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      // 초기화 완료까지 대기
      while (this.initializing && !this.initialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.initializing = true;
      // 문서 저장
      documents.forEach(doc => {
        this.documents.set(doc.id, doc);
      });

      // BM25 인덱스 구축 (무거운 작업)
      await this.buildBM25Indexes(documents);
      
      this.initialized = true;
    } catch (error) {
      console.error(`[DEBUG] Repository initialization failed: ${error}`);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * BM25 인덱스 구축 (별도 메서드로 분리)
   */
  private async buildBM25Indexes(documents: KnowledgeDocument[]): Promise<void> {
    const domainChunks = new Map<string, DocumentChunk[]>();
    const allChunks: DocumentChunk[] = [];

    documents.forEach(doc => {
      const chunks = doc.getChunks();
      allChunks.push(...chunks);

      const domain = doc.domainName || 'general';
      if (!domainChunks.has(domain)) {
        domainChunks.set(domain, []);
      }
      domainChunks.get(domain)!.push(...chunks);
    });

    // 도메인별 계산기 초기화 (CPU 집약적 작업)
    domainChunks.forEach((chunks, domain) => {
      this.domainCalculators.set(domain, new BM25Calculator(chunks));
      console.error(`[DEBUG] Created BM25Calculator for domain: ${domain} (${chunks.length} chunks)`);
    });

    // 전역 계산기 초기화
    if (allChunks.length > 0) {
      this.globalCalculator = new BM25Calculator(allChunks);
      console.error(`[DEBUG] Created global BM25Calculator (${allChunks.length} chunks)`);
    }
  }

  /**
   * 초기화 완료 여부 확인
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 초기화 완료 보장 (가드 메서드)
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Repository가 아직 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  /**
   * 키워드로 문서 검색
   * @param keywords 검색 키워드 배열
   * @param options 검색 옵션
   * @returns 검색 결과 문자열
   */
  async searchDocuments(
    keywords: string[],
    options: {
      domain?: string;
      topN?: number;
      contextWindow?: number;
    } = {}
  ): Promise<string> {
    this.ensureInitialized();
    const { domain, topN = 10, contextWindow = 1 } = options;

    // 검색할 계산기 선택
    let calculator: BM25Calculator | null;
    if (domain && this.domainCalculators.has(domain)) {
      calculator = this.domainCalculators.get(domain)!;
    } else {
      calculator = this.globalCalculator;
    }

    if (!calculator) {
      return "검색 가능한 문서가 없습니다.";
    }

    // 키워드를 정규식 패턴으로 변환
    const pattern = keywords
      .map(keyword => escapeRegExp(keyword.trim()))
      .filter(keyword => keyword.length > 0)
      .join("|");

    if (!pattern) {
      return "유효한 검색 키워드가 없습니다.";
    }

    // BM25 검색 수행
    const results = calculator.calculate(pattern);
    const topResults = results.slice(0, topN);

    return this.formatSearchResults(topResults, contextWindow);
  }

  /**
   * ID로 문서 조회
   * @param id 문서 ID
   * @returns 문서 객체 또는 null
   */
  getDocumentById(id: number): KnowledgeDocument | null {
    this.ensureInitialized();
    return this.documents.get(id) || null;
  }

  /**
   * Repository 인스턴스 ID 조회
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * 모든 도메인 목록 조회
   * @returns 도메인 정보 배열
   */
  listDomains(): Array<{ name: string; documentCount: number }> {
    this.ensureInitialized();
    console.error(`[DEBUG] listDomains called on instance ${this.instanceId}, documents.size=${this.documents.size}`);
    const domainCounts = new Map<string, number>();

    this.documents.forEach(doc => {
      const domain = doc.domainName || 'general';
      console.error(`[DEBUG] Processing document: ID=${doc.id}, domain=${domain}`);
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    });

    console.error(`[DEBUG] domainCounts Map: ${JSON.stringify([...domainCounts.entries()])}`);
    const result = Array.from(domainCounts.entries()).map(([name, count]) => ({
      name,
      documentCount: count
    }));
    console.error(`[DEBUG] listDomains result: ${JSON.stringify(result)}`);

    return result;
  }

  /**
   * 특정 도메인의 문서 목록 조회
   * @param domain 도메인 이름
   * @returns 문서 정보 배열
   */
  listDocumentsByDomain(domain?: string): Array<{
    id: number;
    title: string;
    description: string;
    keywords: string[];
  }> {
    this.ensureInitialized();
    const docs: KnowledgeDocument[] = [];

    this.documents.forEach(doc => {
      if (!domain || doc.domainName === domain || (!doc.domainName && domain === 'general')) {
        docs.push(doc);
      }
    });

    return docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      keywords: doc.keywords
    }));
  }

  /**
   * 검색 결과 포맷팅
   */
  private formatSearchResults(results: SearchResult[], contextWindow: number): string {
    if (results.length === 0) {
      return "검색 결과가 없습니다.";
    }

    const formattedResults = results
      .map(result => {
        const document = this.documents.get(result.id);
        if (!document) return null;

        const chunks = document.getChunkWithWindow(result.chunkId, contextWindow);
        if (chunks.length === 0) return null;

        return this.formatChunks(chunks, result.score);
      })
      .filter(result => result !== null);

    return formattedResults.join("\n\n---\n\n");
  }

  /**
   * 청크 포맷팅
   */
  private formatChunks(chunks: DocumentChunk[], score: number): string {
    const firstChunk = chunks[0];
    const content = chunks.map(chunk => chunk.text).join("\n\n");

    return `## 문서: ${firstChunk.originTitle}
* 문서 ID: ${firstChunk.id}
* 관련도 점수: ${score.toFixed(2)}

${content}`;
  }

  /**
   * 동적으로 문서 추가 (단일 문서)
   */
  async addDocument(document: KnowledgeDocument): Promise<void> {
    this.ensureInitialized();
    
    // 기존 문서 ID 중복 체크
    if (this.documents.has(document.id)) {
      console.error(`[DEBUG] Replacing existing document with ID: ${document.id}`);
    }
    
    this.documents.set(document.id, document);
    console.error(`[DEBUG] Added document to repository: ID=${document.id}, domain=${document.domainName}`);
    
    // 증분 인덱스 업데이트는 별도 메서드에서 처리
  }

  /**
   * 동적으로 문서 제거
   */
  async removeDocument(documentId: number): Promise<boolean> {
    this.ensureInitialized();
    
    const removed = this.documents.delete(documentId);
    if (removed) {
      console.error(`[DEBUG] Removed document from repository: ID=${documentId}`);
      // 인덱스 재구축 필요 (성능상 전체 재구축)
      await this.rebuildIndexes();
    }
    
    return removed;
  }

  /**
   * 증분 인덱스 업데이트 (새로 추가된 문서들에 대해)
   */
  async updateIndexes(newDocuments: KnowledgeDocument[]): Promise<void> {
    this.ensureInitialized();
    
    console.error(`[DEBUG] Updating indexes for ${newDocuments.length} new documents`);
    
    // 새 문서의 청크들 수집
    const newChunks: DocumentChunk[] = [];
    newDocuments.forEach(doc => {
      newChunks.push(...doc.getChunks());
    });

    // 도메인별로 새 청크들 분류
    const newDomainChunks = new Map<string, DocumentChunk[]>();
    newDocuments.forEach(doc => {
      const domain = doc.domainName || 'general';
      if (!newDomainChunks.has(domain)) {
        newDomainChunks.set(domain, []);
      }
      newDomainChunks.get(domain)!.push(...doc.getChunks());
    });

    // 기존 인덱스에 증분 업데이트
    for (const [domain, chunks] of newDomainChunks.entries()) {
      if (this.domainCalculators.has(domain)) {
        // 기존 도메인: 기존 청크와 병합하여 새 계산기 생성
        const existingChunks = this.getExistingChunksForDomain(domain);
        const allChunks = [...existingChunks, ...chunks];
        
        this.domainCalculators.set(domain, new BM25Calculator(allChunks));
        console.error(`[DEBUG] Updated BM25Calculator for domain: ${domain} (${allChunks.length} total chunks)`);
      } else {
        // 새 도메인: 새 계산기 생성
        this.domainCalculators.set(domain, new BM25Calculator(chunks));
        console.error(`[DEBUG] Created new BM25Calculator for domain: ${domain} (${chunks.length} chunks)`);
      }
    }

    // 전역 계산기 업데이트
    const allChunks: DocumentChunk[] = [];
    this.documents.forEach(doc => {
      allChunks.push(...doc.getChunks());
    });
    
    if (allChunks.length > 0) {
      this.globalCalculator = new BM25Calculator(allChunks);
      console.error(`[DEBUG] Updated global BM25Calculator (${allChunks.length} total chunks)`);
    }
  }

  /**
   * 인덱스 전체 재구축 (문서 삭제 후 등에 사용)
   */
  async rebuildIndexes(): Promise<void> {
    this.ensureInitialized();
    
    console.error('[DEBUG] Rebuilding all BM25 indexes...');
    
    const allDocuments = Array.from(this.documents.values());
    await this.buildBM25Indexes(allDocuments);
    
    console.error('[DEBUG] Index rebuild completed');
  }

  /**
   * 특정 도메인의 기존 청크들 조회 (증분 업데이트용)
   */
  private getExistingChunksForDomain(domain: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    this.documents.forEach(doc => {
      if ((doc.domainName || 'general') === domain) {
        chunks.push(...doc.getChunks());
      }
    });
    
    return chunks;
  }

  /**
   * Repository 상태 조회 (디버깅용)
   */
  getRepositoryStatus() {
    return {
      instanceId: this.instanceId,
      initialized: this.initialized,
      initializing: this.initializing,
      documentCount: this.documents.size,
      domainCalculators: Array.from(this.domainCalculators.keys()),
      hasGlobalCalculator: !!this.globalCalculator
    };
  }

  /**
   * 통계 정보 조회
   */
  getStatistics() {
    // getStatistics는 초기화 체크 없이 허용 (디버그용)
    let totalDocuments = 0;
    let totalChunks = 0;
    let totalWords = 0;

    this.documents.forEach(doc => {
      totalDocuments++;
      const chunks = doc.getChunks();
      totalChunks += chunks.length;
      totalWords += chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
    });

    return {
      totalDocuments,
      totalChunks,
      totalWords,
      averageChunksPerDocument: totalDocuments > 0 ? totalChunks / totalDocuments : 0,
      averageWordsPerChunk: totalChunks > 0 ? totalWords / totalChunks : 0,
      domains: this.listDomains()
    };
  }
} 
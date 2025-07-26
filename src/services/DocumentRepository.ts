import { BM25Calculator, escapeRegExp, type SearchResult, type DocumentChunk } from '../utils/bm25.js';
import { KnowledgeDocument } from '../models/Document.js';
import { logger } from '../utils/logger.js';

/**
 * 문서 저장소
 * BM25 알고리즘을 사용하여 문서를 검색하고 관리
 */
export class DocumentRepository {
  private readonly instanceId: string = `repo-${Date.now()}-${Math.random()}`;
  private readonly documents: Map<number, KnowledgeDocument> = new Map();
  private bm25Calculator: BM25Calculator | null = null;
  private domainChunks: Map<string, DocumentChunk[]> = new Map();
  private initialized: boolean = false;

  constructor(documents?: KnowledgeDocument[]) {
    logger.debug(`Repository constructor (${this.instanceId})`);
    if (documents) {
      this.initializeSync(documents);
    }
  }

  /**
   * 동기적으로 Repository 초기화
   * @param documents 로드된 문서 배열
   */
  private initializeSync(documents: KnowledgeDocument[]): void {
    if (this.initialized) {
      logger.debug(`Repository (${this.instanceId}) already initialized`);
      return;
    }

    logger.debug(`Repository initialization started (${this.instanceId}): received ${documents.length} documents`);

    // 문서 저장
    documents.forEach(doc => {
      logger.debug(`Storing document: ID=${doc.id}, domainName=${doc.domainName}`);
      this.documents.set(doc.id, doc);
    });
    logger.debug(`Repository: stored ${this.documents.size} documents in Map`);

    // BM25 인덱스 구축
    logger.debug(`Building BM25 indexes...`);
    this.buildBM25Indexes(documents);
    
    this.initialized = true;
    logger.debug(`Repository initialization completed (${this.instanceId})`);
  }

  /**
   * BM25 인덱스 구축
   */
  private buildBM25Indexes(documents: KnowledgeDocument[]): void {
    const allChunks: DocumentChunk[] = [];

    // 도메인별 찭크 분류 및 전체 찭크 수집
    documents.forEach(doc => {
      const chunks = doc.getChunks();
      allChunks.push(...chunks);

      const domain = doc.domainName || 'general';
      if (!this.domainChunks.has(domain)) {
        this.domainChunks.set(domain, []);
      }
      this.domainChunks.get(domain)!.push(...chunks);
    });

    // 단일 BM25 계산기 생성 (전체 문서 기반)
    if (allChunks.length > 0) {
      this.bm25Calculator = new BM25Calculator(allChunks);
      logger.debug(`Created BM25Calculator (${allChunks.length} chunks)`);
      
      // 도메인별 통계 로깅
      this.domainChunks.forEach((chunks, domain) => {
        logger.debug(`Domain ${domain}: ${chunks.length} chunks`);
      });
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
      throw new Error('Repository가 초기화되지 않았습니다.');
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

    if (!this.bm25Calculator) {
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
    let results = this.bm25Calculator.calculate(pattern);
    
    // 도메인 필터링 (지정된 경우)
    if (domain && this.domainChunks.has(domain)) {
      const domainChunkIds = new Set(
        this.domainChunks.get(domain)!.map(chunk => chunk.chunkId)
      );
      results = results.filter(result => domainChunkIds.has(result.chunkId));
    }
    
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
    logger.debug(`listDomains called on instance ${this.instanceId}, documents.size=${this.documents.size}`);
    const domainCounts = new Map<string, number>();

    this.documents.forEach(doc => {
      const domain = doc.domainName || 'general';
      logger.debug(`Processing document: ID=${doc.id}, domain=${domain}`);
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    });

    logger.debug(`domainCounts Map: ${JSON.stringify([...domainCounts.entries()])}`);
    const result = Array.from(domainCounts.entries()).map(([name, count]) => ({
      name,
      documentCount: count
    }));
    logger.debug(`listDomains result: ${JSON.stringify(result)}`);

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
import { BM25Calculator, escapeRegExp, type SearchResult, type DocumentChunk } from '../utils/bm25.js';
import { KnowledgeDocument } from '../models/Document.js';

/**
 * 문서 저장소
 * BM25 알고리즘을 사용하여 문서를 검색하고 관리
 */
export class DocumentRepository {
  private readonly documents: Map<number, KnowledgeDocument> = new Map();
  private readonly domainCalculators: Map<string, BM25Calculator> = new Map();
  private globalCalculator: BM25Calculator | null = null;

  constructor(documents: KnowledgeDocument[]) {
    // 문서 저장
    console.error(`[DEBUG] Repository constructor: received ${documents.length} documents`);
    documents.forEach(doc => {
      console.error(`[DEBUG] Storing document: ID=${doc.id}, domainName=${doc.domainName}`);
      this.documents.set(doc.id, doc);
    });
    console.error(`[DEBUG] Repository constructor: stored ${this.documents.size} documents in Map`);

    // 도메인별 BM25 계산기 생성
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

    // 도메인별 계산기 초기화
    domainChunks.forEach((chunks, domain) => {
      this.domainCalculators.set(domain, new BM25Calculator(chunks));
    });

    // 전역 계산기 초기화
    if (allChunks.length > 0) {
      this.globalCalculator = new BM25Calculator(allChunks);
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
    return this.documents.get(id) || null;
  }

  /**
   * 모든 도메인 목록 조회
   * @returns 도메인 정보 배열
   */
  listDomains(): Array<{ name: string; documentCount: number }> {
    console.error(`[DEBUG] listDomains called, documents.size=${this.documents.size}`);
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
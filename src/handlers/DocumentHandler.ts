import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { ServerStateManager } from '../server/ServerStateManager.js';

/**
 * 문서 관련 MCP 도구 핸들러
 */
export class DocumentHandler {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * ID로 문서 조회 도구 처리
   */
  async handleGetDocumentById(args: any): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const repository = this.stateManager.repository!;

    // 파라미터 검증
    if (!args.documentId || typeof args.documentId !== 'string') {
      throw new Error('documentId가 필요합니다');
    }

    const documentId = args.documentId as string;
    const includeContent = args.includeContent !== false; // 기본값: true

    console.error(`[DEBUG] 문서 조회 요청: documentId=${documentId}, includeContent=${includeContent}`);

    try {
      const document = repository.getDocumentById(parseInt(documentId, 10));
      if (!document) {
        throw new Error(`문서를 찾을 수 없습니다: ${documentId}`);
      }

      const chunks = document.getChunks();
      const response = {
        id: document.id,
        title: document.title,
        domain: document.domainName,
        path: document.link,
        metadata: { title: document.title, description: document.description, keywords: document.keywords },
        chunksCount: chunks.length,
        content: includeContent ? document.content : undefined,
        chunks: includeContent ? chunks.map((chunk, index) => ({
          index,
          content: chunk.text,
          metadata: { wordCount: chunk.wordCount }
        })) : undefined,
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 문서 반환: ${document.title} (${chunks.length}개 청크)`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 문서 조회 실패: ${error}`);
      throw new Error(`문서 조회 실패: ${error}`);
    }
  }

  /**
   * 도메인 목록 조회 도구 처리
   */
  async handleListDomains(): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const repository = this.stateManager.repository!;

    console.error(`[DEBUG] 도메인 목록 요청`);

    try {
      const statistics = repository.getStatistics();
      const domains = statistics.domains;

      const response = {
        domains: domains.map(domain => ({
          name: domain.name,
          documentCount: domain.documentCount,
          chunkCount: 0 // 청크 수는 전체 통계에서 계산
        })),
        totalDomains: domains.length,
        totalDocuments: statistics.totalDocuments,
        totalChunks: statistics.totalChunks,
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 도메인 목록 반환: ${domains.length}개 도메인`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 도메인 목록 조회 실패: ${error}`);
      throw new Error(`도메인 목록 조회 실패: ${error}`);
    }
  }

  /**
   * 문서 메타데이터 조회 도구 처리
   */
  async handleGetDocumentMetadata(args: any): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const repository = this.stateManager.repository!;

    const domain = args.domain as string | undefined;

    console.error(`[DEBUG] 문서 메타데이터 요청: domain=${domain}`);

    try {
      const allDocuments = repository.listDocumentsByDomain();
      const filteredDocuments = domain ? repository.listDocumentsByDomain(domain) : allDocuments;

      const metadata = filteredDocuments.map(doc => ({
        id: doc.id,
        title: doc.title,
        domain: 'general', // 기본 도메인
        path: '', // 경로 정보 없음
        chunksCount: 0, // 청크 수 정보 없음
        metadata: { title: doc.title, description: doc.description, keywords: doc.keywords },
        lastModified: null
      }));

      const response = {
        documents: metadata,
        totalCount: metadata.length,
        domain: domain || 'all',
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 문서 메타데이터 반환: ${metadata.length}개 문서`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 문서 메타데이터 조회 실패: ${error}`);
      throw new Error(`문서 메타데이터 조회 실패: ${error}`);
    }
  }
}
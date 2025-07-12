import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { ServerStateManager } from '../server/ServerStateManager.js';
import { createSearchCacheKey } from '../services/CacheService.js';

/**
 * 검색 관련 MCP 도구 핸들러
 */
export class SearchHandler {
  private stateManager: ServerStateManager;

  constructor() {
    this.stateManager = ServerStateManager.getInstance();
  }

  /**
   * 문서 검색 도구 처리
   */
  async handleSearchDocuments(args: any): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const repository = this.stateManager.repository!;
    const searchCache = this.stateManager.searchCache!;
    const analyticsService = this.stateManager.analyticsService!;

    // 파라미터 검증
    if (!args.keywords || !Array.isArray(args.keywords) || args.keywords.length === 0) {
      throw new Error('keywords 배열이 필요합니다');
    }

    const keywords = args.keywords as string[];
    const domain = args.domain as string | undefined;
    const limit = Math.min(args.limit || 10, 50); // 최대 50개로 제한

    console.error(`[DEBUG] 검색 요청: keywords=${JSON.stringify(keywords)}, domain=${domain}, limit=${limit}`);

    try {
      // 캐시 확인
      const cacheKey = createSearchCacheKey(keywords, domain, limit);
      const cachedResult = searchCache.get(cacheKey);
      if (cachedResult) {
        console.error(`[DEBUG] 캐시에서 검색 결과 반환`);
        await analyticsService.recordSearchQuery(keywords, domain, limit, cachedResult.length, 0, true);
        return { content: [{ type: 'text', text: JSON.stringify(cachedResult, null, 2) }] };
      }

      // 검색 실행
      const searchResultsText = await repository.searchDocuments(keywords, { domain, topN: limit });
      const searchResults = JSON.parse(searchResultsText || '[]');
      console.error(`[DEBUG] 검색 완료: ${searchResults.length}개 결과 발견`);

      // 캐시에 저장
      searchCache.set(cacheKey, searchResults);

      // 분석 기록
      await analyticsService.recordSearchQuery(keywords, domain, limit, searchResults.length, 0, false);

      const response = {
        results: searchResults,
        totalFound: searchResults.length,
        query: {
          keywords,
          domain,
          limit
        },
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 검색 실행 실패: ${error}`);
      throw new Error(`검색 실행 실패: ${error}`);
    }
  }

  /**
   * 컨텍스트와 함께 청크 조회 도구 처리
   */
  async handleGetChunkWithContext(args: any): Promise<{ content: TextContent[] }> {
    await this.stateManager.ensureServerReady();

    const repository = this.stateManager.repository!;

    // 파라미터 검증
    if (!args.documentId || typeof args.documentId !== 'string') {
      throw new Error('documentId가 필요합니다');
    }
    if (args.chunkIndex === undefined || typeof args.chunkIndex !== 'number') {
      throw new Error('chunkIndex가 필요합니다');
    }

    const documentId = args.documentId as string;
    const chunkIndex = args.chunkIndex as number;
    const contextSize = Math.min(args.contextSize || 2, 5); // 최대 5개 청크 컨텍스트

    console.error(`[DEBUG] 청크 컨텍스트 요청: documentId=${documentId}, chunkIndex=${chunkIndex}, contextSize=${contextSize}`);

    try {
      // 문서 존재 확인
      const document = repository.getDocumentById(parseInt(documentId, 10));
      if (!document) {
        throw new Error(`문서를 찾을 수 없습니다: ${documentId}`);
      }

      // 청크 인덱스 검증
      const chunks = document.getChunks();
      if (chunkIndex < 0 || chunkIndex >= chunks.length) {
        throw new Error(`잘못된 청크 인덱스: ${chunkIndex} (범위: 0-${chunks.length - 1})`);
      }

      // 컨텍스트 범위 계산
      const startIndex = Math.max(0, chunkIndex - contextSize);
      const endIndex = Math.min(chunks.length - 1, chunkIndex + contextSize);

      // 컨텍스트 청크들 수집
      const contextChunks = [];
      for (let i = startIndex; i <= endIndex; i++) {
        const chunk = chunks[i];
        contextChunks.push({
          index: i,
          content: chunk.text,
          isTarget: i === chunkIndex,
          metadata: { wordCount: chunk.wordCount }
        });
      }

      const response = {
        document: {
          id: document.id,
          title: document.title,
          domain: document.domainName,
          totalChunks: chunks.length
        },
        targetChunk: {
          index: chunkIndex,
          content: chunks[chunkIndex].text,
          metadata: { wordCount: chunks[chunkIndex].wordCount }
        },
        context: {
          startIndex,
          endIndex,
          contextSize,
          chunks: contextChunks
        },
        timestamp: new Date().toISOString()
      };

      console.error(`[DEBUG] 청크 컨텍스트 반환: ${contextChunks.length}개 청크`);

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };

    } catch (error) {
      console.error(`[ERROR] 청크 컨텍스트 조회 실패: ${error}`);
      throw new Error(`청크 컨텍스트 조회 실패: ${error}`);
    }
  }
}
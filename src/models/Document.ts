import type { DocumentChunk } from '../utils/bm25.js';
import { splitMarkdownIntoChunks, joinShortChunks, extractMetadata } from '../utils/markdownParser.js';

export interface DocumentMetadata {
  title: string;
  description: string;
  keywords: string[];
  domain?: string;
  category?: string;
  source?: string;
  lastUpdated?: Date;
}

export interface RemoteMarkdownDocument {
  id: string;
  link: string;
  markdown: string;
  chunks: string[];
  metadata: DocumentMetadata;
}

/**
 * 문서 클래스
 * 마크다운 문서를 청크로 분할하고 검색 가능한 형태로 관리
 */
export class KnowledgeDocument {
  private readonly chunks: DocumentChunk[] = [];
  private readonly metadata: DocumentMetadata;

  constructor(
    private readonly remoteDocument: RemoteMarkdownDocument,
    public readonly id: number,
    private readonly domain?: string
  ) {
    this.metadata = {
      ...remoteDocument.metadata,
      domain: domain || remoteDocument.metadata.domain
    };

    // 청크 생성
    remoteDocument.chunks.forEach((chunk, index) => {
      this.chunks.push({
        id: this.id,
        chunkId: this.id * 1000 + index,
        originTitle: this.metadata.title,
        text: chunk,
        wordCount: chunk.split(/\s+/).filter(word => word.length > 0).length,
      });
    });
  }

  /**
   * 특정 청크와 주변 컨텍스트 반환
   * @param chunkId 청크 ID
   * @param windowSize 컨텍스트 윈도우 크기
   * @returns 청크 배열
   */
  getChunkWithWindow(chunkId: number, windowSize: number): DocumentChunk[] {
    const chunkIndex = this.chunks.findIndex(
      (chunk) => chunk.chunkId === chunkId
    );
    
    if (chunkIndex === -1) {
      return [];
    }

    const start = Math.max(0, chunkIndex - windowSize);
    const end = Math.min(this.chunks.length, chunkIndex + windowSize + 1);

    return this.chunks.slice(start, end);
  }

  /**
   * 모든 청크 반환
   */
  getChunks(): DocumentChunk[] {
    return this.chunks;
  }

  /**
   * 전체 문서 내용 반환
   */
  get content(): string {
    return this.remoteDocument.markdown;
  }

  get title(): string {
    return this.metadata.title;
  }

  get description(): string {
    return this.metadata.description;
  }

  get keywords(): string[] {
    return this.metadata.keywords;
  }

  get domainName(): string | undefined {
    return this.domain;
  }

  get link(): string {
    return this.remoteDocument.link;
  }

  /**
   * 문서를 JSON으로 변환
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      keywords: this.keywords,
      domain: this.domain,
      link: this.link,
      chunkCount: this.chunks.length,
      totalWords: this.chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0)
    };
  }
}

/**
 * 마크다운 파일에서 RemoteMarkdownDocument 생성
 */
export function createRemoteMarkdownDocument(
  id: string,
  link: string,
  markdown: string,
  minChunkWords: number = 30
): RemoteMarkdownDocument {
  const metadata = extractMetadata(markdown);
  const rawChunks = splitMarkdownIntoChunks(markdown);
  const chunks = joinShortChunks(rawChunks, minChunkWords);

  return {
    id,
    link,
    markdown,
    chunks,
    metadata
  };
} 
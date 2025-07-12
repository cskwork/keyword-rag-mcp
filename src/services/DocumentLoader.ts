import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../models/Document.js';

export interface DocumentSource {
  type: 'local' | 'remote';
  basePath: string;
  domains: Array<{
    name: string;
    path: string;
    category?: string;
  }>;
}

/**
 * 간소화된 문서 메타데이터
 */
interface SimpleDocumentMetadata {
  title: string;
  description?: string;
  wordCount: number;
  keywords: string[];
}

/**
 * 간소화된 문서 로더 (전처리 통합)
 * 로컬 파일 시스템 또는 원격 URL에서 마크다운 문서를 로드하고 기본 전처리 수행
 */
export class DocumentLoader {
  private documents: KnowledgeDocument[] = [];
  private documentIdCounter = 0;

  constructor(private readonly source: DocumentSource) {}

  /**
   * 모든 문서 로드
   */
  async loadAllDocuments(): Promise<KnowledgeDocument[]> {
    this.documents = [];
    this.documentIdCounter = 0;

    console.error(`[DEBUG] DocumentLoader.loadAllDocuments start. Domains to process: ${this.source.domains.length}`);
    for (const domain of this.source.domains) {
      console.error(`[DEBUG] Processing domain: ${domain.name}, path: ${domain.path}`);
      await this.loadDomainDocuments(domain);
      console.error(`[DEBUG] Completed domain: ${domain.name}. Total documents so far: ${this.documents.length}`);
    }

    console.error(`[DEBUG] DocumentLoader.loadAllDocuments completed. Total documents loaded: ${this.documents.length}`);
    return this.documents;
  }

  /**
   * 특정 도메인의 문서 로드
   */
  private async loadDomainDocuments(domain: {
    name: string;
    path: string;
    category?: string;
  }): Promise<void> {
    const fullPath = path.join(this.source.basePath, domain.path);
    console.error(`[DEBUG] loadDomainDocuments for ${domain.name}. fullPath=${fullPath}. exists=${fsSync.existsSync(fullPath)}`);

    if (this.source.type === 'local') {
      await this.loadLocalDocuments(fullPath, domain.name, domain.category);
    } else {
      await this.loadRemoteDocuments(fullPath, domain.name, domain.category);
    }
  }

  /**
   * 로컬 파일 시스템에서 문서 로드
   */
  private async loadLocalDocuments(
    dirPath: string,
    domainName: string,
    category?: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 하위 디렉토리 재귀적 탐색
          await this.loadLocalDocuments(fullPath, domainName, category);
        } else if (entry.isFile() && this.isMarkdownFile(entry.name)) {
          // 마크다운 파일 로드 및 전처리
          const content = await fs.readFile(fullPath, 'utf-8');
          const document = await this.createDocument(
            content,
            fullPath,
            domainName,
            category
          );
          this.documents.push(document);
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load local documents from ${dirPath}:`, (error as Error).message);
      // Failed to load documents (silent for MCP protocol)
    }
  }

  /**
   * 원격 소스에서 문서 로드 (llms.txt 형식)
   */
  private async loadRemoteDocuments(
    remotePath: string,
    domainName: string,
    category?: string
  ): Promise<void> {
    try {
      console.error(`[DEBUG] Loading remote documents from: ${remotePath}`);
      
      const response = await axios.get(remotePath, { timeout: 10000 });
      const llmsTxtContent = response.data;
      
      const docUrls = this.parseLlmsTxt(llmsTxtContent);
      console.error(`[DEBUG] Found ${docUrls.length} document URLs in llms.txt`);

      for (const docUrl of docUrls) {
        try {
          const docResponse = await axios.get(docUrl, { timeout: 10000 });
          const content = docResponse.data;
          const document = await this.createDocument(
            content,
            docUrl,
            domainName,
            category
          );
          this.documents.push(document);
        } catch (docError) {
          console.error(`[DEBUG] Failed to load document from ${docUrl}:`, (docError as Error).message);
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load remote documents from ${remotePath}:`, (error as Error).message);
    }
  }

  /**
   * 문서 생성 및 간소화된 전처리 수행
   */
  private async createDocument(
    content: string,
    link: string,
    domainName: string,
    category?: string
  ): Promise<KnowledgeDocument> {
    try {
      // 간소화된 전처리 수행
      const processed = this.simplePreprocess(content, link);
      
      // RemoteMarkdownDocument 생성
      const remoteDoc = createRemoteMarkdownDocument(
        `doc-${this.documentIdCounter}`,
        link,
        content
      );

      // 전처리된 메타데이터 통합
      if (remoteDoc.metadata) {
        remoteDoc.metadata.keywords = [
          ...new Set([
            ...remoteDoc.metadata.keywords,
            ...processed.keywords
          ])
        ];
        remoteDoc.metadata.description = processed.description || remoteDoc.metadata.description;
      }

      // KnowledgeDocument로 래핑
      const document = new KnowledgeDocument(
        remoteDoc,
        this.documentIdCounter++,
        domainName
      );

      console.error(`[DEBUG] Created document: ${processed.title} (${processed.wordCount} words) in domain ${domainName}`);
      return document;

    } catch (error) {
      console.error(`[DEBUG] Failed to create document from ${link}:`, (error as Error).message);
      
      // 기본 문서라도 생성
      const remoteDoc = createRemoteMarkdownDocument(
        `doc-${this.documentIdCounter}`,
        link,
        content
      );

      return new KnowledgeDocument(
        remoteDoc,
        this.documentIdCounter++,
        domainName
      );
    }
  }

  /**
   * 간소화된 문서 전처리 (복잡한 메타데이터 추출 제거)
   */
  private simplePreprocess(content: string, filePath: string): SimpleDocumentMetadata {
    // 제목 추출 (첫 번째 H1 또는 파일명)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath, path.extname(filePath));

    // 설명 추출 (첫 번째 문단)
    const descMatch = content.match(/^(?!#)(.+)$/m);
    const description = descMatch ? descMatch[1].trim().substring(0, 200) : undefined;

    // 단어 수 계산
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    // 간단한 키워드 추출 (제목과 헤딩에서)
    const keywords: string[] = [];
    
    // 제목에서 키워드
    if (title) {
      keywords.push(...title.toLowerCase().split(/\s+/).filter(word => word.length > 2));
    }

    // 모든 헤딩에서 키워드
    const headingMatches = content.match(/^#{1,6}\s+(.+)$/gm) || [];
    headingMatches.forEach(heading => {
      const text = heading.replace(/^#+\s+/, '').toLowerCase();
      keywords.push(...text.split(/\s+/).filter(word => word.length > 2));
    });

    // 중복 제거 및 상위 10개만
    const uniqueKeywords = [...new Set(keywords)].slice(0, 10);

    return {
      title,
      description,
      wordCount,
      keywords: uniqueKeywords
    };
  }

  /**
   * llms.txt 파일 파싱
   */
  private parseLlmsTxt(content: string): string[] {
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    const urls: string[] = [];
    for (const line of lines) {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        urls.push(line);
      }
    }

    return urls;
  }

  /**
   * 마크다운 파일 여부 확인
   */
  private isMarkdownFile(filename: string): boolean {
    const extensions = ['.md', '.mdx', '.markdown'];
    return extensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * 로드된 문서 수 반환
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * 특정 도메인의 문서 수 반환
   */
  getDomainDocumentCount(domainName: string): number {
    return this.documents.filter(doc => doc.domainName === domainName).length;
  }
}
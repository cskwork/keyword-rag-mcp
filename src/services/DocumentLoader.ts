import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../models/Document.js';
import { logger } from '../utils/logger.js';
import { validateDirectoryPath, secureFileRead, validateAndSanitizeUrl, SecurityError } from '../utils/security.js';

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
 * 문서 로더
 * 로컬 파일 시스템 또는 원격 URL에서 마크다운 문서를 로드
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

    logger.debug(`=== DOCUMENT LOADER START ===`);
    logger.debug(`DocumentLoader.loadAllDocuments start. Domains to process: ${this.source.domains.length}`);
    logger.debug(`Base path: ${this.source.basePath}`);
    logger.debug(`Source type: ${this.source.type}`);
    
    // 도메인 설정 정보 출력 (auto-discovery 지원)
    if (this.source.domains.length > 0) {
      logger.debug(`Domain configuration received by DocumentLoader:`);
      for (const domain of this.source.domains) {
        logger.debug(`  - ${domain.name}: ${domain.path} (${domain.category || 'No category'})`);
      }
    } else {
      logger.debug(`WARNING: DocumentLoader received NO domains!`);
    }
    
    for (const domain of this.source.domains) {
      logger.debug(`Processing domain: ${domain.name}, path: ${domain.path}, category: ${domain.category || 'N/A'}`);
      await this.loadDomainDocuments(domain);
      logger.debug(`Completed domain: ${domain.name}. Total documents so far: ${this.documents.length}`);
    }

    logger.debug(`DocumentLoader.loadAllDocuments completed. Total documents loaded: ${this.documents.length}`);
    
    // 로드된 문서들의 도메인별 통계 출력
    this.logDomainStatistics();
    
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
    logger.debug(`loadDomainDocuments for ${domain.name}. fullPath=${fullPath}. exists=${fsSync.existsSync(fullPath)}`);

    if (this.source.type === 'local') {
      try {
        const validatedPath = validateDirectoryPath(fullPath, this.source.basePath);
        await this.loadLocalDocuments(validatedPath, domain.name, domain.category);
      } catch (error) {
        if (error instanceof SecurityError) {
          logger.warn(`Skipping domain ${domain.name} due to security issue: ${error.message}`);
          return;
        }
        throw error;
      }
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
          // 마크다운 파일 로드 (보안 검사 포함)
          try {
            const secureFilePath = secureFileRead(fullPath, dirPath);
            const content = await fs.readFile(secureFilePath, 'utf-8');
            const document = this.createDocument(
              content,
              secureFilePath,
              domainName,
              category
            );
            this.documents.push(document);
          } catch (error) {
            if (error instanceof SecurityError) {
              logger.warn(`Skipping file ${fullPath} due to security issue: ${error.message}`);
              continue;
            }
            throw error;
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to load local documents from ${dirPath}:`, (error as Error).message);
      logger.debug(`Working directory: ${process.cwd()}`);
      logger.debug(`Directory exists: ${fsSync.existsSync(dirPath)}`);
      // Failed to load documents (silent for MCP protocol)
    }
  }

  /**
   * 원격 URL에서 문서 로드
   */
  private async loadRemoteDocuments(
    baseUrl: string,
    domainName: string,
    category?: string
  ): Promise<void> {
    try {
      // llms.txt 파일 로드 시도 (보안 검사 포함)
      const llmsUrl = `${baseUrl}/llms.txt`;
      const validatedLlmsUrl = validateAndSanitizeUrl(llmsUrl);
      const response = await axios.get(validatedLlmsUrl, {
        timeout: 10000, // 10초 타임아웃
        maxContentLength: 1024 * 1024, // 1MB 최대 크기
        maxRedirects: 3 // 최대 3번 리다이렉트
      });
      const llmsContent = response.data;

      // llms.txt 파싱하여 문서 URL 추출
      const documentUrls = this.parseLlmsTxt(llmsContent, baseUrl);

      // 각 문서 로드 (보안 검사 포함)
      for (const docUrl of documentUrls) {
        try {
          const validatedDocUrl = validateAndSanitizeUrl(docUrl);
          const docResponse = await axios.get(validatedDocUrl, {
            timeout: 10000, // 10초 타임아웃
            maxContentLength: 10 * 1024 * 1024, // 10MB 최대 크기
            maxRedirects: 3 // 최대 3번 리다이렉트
          });
          const content = docResponse.data;
          
          // 콘텐츠 크기 추가 검사
          if (typeof content === 'string' && content.length > 10 * 1024 * 1024) {
            logger.warn(`Document ${validatedDocUrl} too large, skipping`);
            continue;
          }
          
          const document = this.createDocument(
            content,
            validatedDocUrl,
            domainName,
            category
          );
          this.documents.push(document);
        } catch (error) {
          if (error instanceof SecurityError) {
            logger.warn(`Skipping document ${docUrl} due to security issue: ${error.message}`);
            continue;
          }
          logger.error(`Failed to load remote document ${docUrl}:`, (error as Error).message);
          // Failed to load document (silent for MCP protocol)
        }
      }
    } catch (error) {
      logger.error(`Failed to load remote documents from ${baseUrl}:`, (error as Error).message);
      // Failed to load documents (silent for MCP protocol)
    }
  }

  /**
   * llms.txt 파싱
   */
  private parseLlmsTxt(content: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const lines = content.split('\n');

    // 라인 수 제한 (DoS 방지)
    if (lines.length > 1000) {
      logger.warn('llms.txt has too many lines, limiting to first 1000');
      lines.length = 1000;
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        try {
          // 상대 경로를 절대 경로로 변환
          const url = trimmed.startsWith('http') 
            ? trimmed 
            : `${baseUrl}/${trimmed}`;
          
          // URL 검증
          const validatedUrl = validateAndSanitizeUrl(url);
          urls.push(validatedUrl);
          
          // URL 수 제한 (DoS 방지)
          if (urls.length >= 100) {
            logger.warn('Too many URLs in llms.txt, limiting to first 100');
            break;
          }
        } catch (error) {
          if (error instanceof SecurityError) {
            logger.warn(`Skipping invalid URL in llms.txt: ${trimmed} - ${error.message}`);
            continue;
          }
          throw error;
        }
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
   * 문서 객체 생성
   */
  private createDocument(
    content: string,
    link: string,
    domainName: string,
    category?: string
  ): KnowledgeDocument {
    const remoteDoc = createRemoteMarkdownDocument(
      `doc-${this.documentIdCounter}`,
      link,
      content
    );

    const document = new KnowledgeDocument(
      remoteDoc,
      this.documentIdCounter++,
      domainName
    );

    logger.debug(`Created document: ID=${document.id}, title=${document.title}, domainName=${document.domainName}`);

    return document;
  }

  /**
   * 로드된 문서 개수
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * 로드된 문서 목록
   */
  getDocuments(): KnowledgeDocument[] {
    return this.documents;
  }

  /**
   * 도메인별 문서 로드 통계 출력
   */
  private logDomainStatistics(): void {
    if (this.documents.length === 0) {
      logger.debug(`No documents loaded`);
      return;
    }

    // 도메인별 문서 개수 집계
    const domainStats = new Map<string, number>();
    for (const doc of this.documents) {
      const domainName = doc.domainName || 'unknown';
      const count = domainStats.get(domainName) || 0;
      domainStats.set(domainName, count + 1);
    }

    logger.debug(`Document loading statistics:`);
    logger.debug(`Total documents: ${this.documents.length}`);
    logger.debug(`Documents by domain:`);
    
    for (const [domain, count] of domainStats.entries()) {
      logger.debug(`  - ${domain}: ${count} documents`);
    }
  }
} 
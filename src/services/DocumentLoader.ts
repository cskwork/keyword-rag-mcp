import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../models/Document.js';
import { DocumentPreprocessor } from './DocumentPreprocessor.js';

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
  private preprocessor: DocumentPreprocessor;

  constructor(private readonly source: DocumentSource) {
    this.preprocessor = new DocumentPreprocessor();
  }

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
          // 마크다운 파일 로드
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
      console.error(`[DEBUG] Working directory: ${process.cwd()}`);
      console.error(`[DEBUG] Directory exists: ${fsSync.existsSync(dirPath)}`);
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
      // llms.txt 파일 로드 시도
      const llmsUrl = `${baseUrl}/llms.txt`;
      const response = await axios.get(llmsUrl);
      const llmsContent = response.data;

      // llms.txt 파싱하여 문서 URL 추출
      const documentUrls = this.parseLlmsTxt(llmsContent, baseUrl);

      // 각 문서 로드
      for (const docUrl of documentUrls) {
        try {
          const docResponse = await axios.get(docUrl);
          const content = docResponse.data;
          const document = await this.createDocument(
            content,
            docUrl,
            domainName,
            category
          );
          this.documents.push(document);
        } catch (error) {
          console.error(`[DEBUG] Failed to load remote document ${docUrl}:`, (error as Error).message);
          // Failed to load document (silent for MCP protocol)
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load remote documents from ${baseUrl}:`, (error as Error).message);
      // Failed to load documents (silent for MCP protocol)
    }
  }

  /**
   * llms.txt 파싱
   */
  private parseLlmsTxt(content: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // 상대 경로를 절대 경로로 변환
        const url = trimmed.startsWith('http') 
          ? trimmed 
          : `${baseUrl}/${trimmed}`;
        urls.push(url);
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
   * 문서 객체 생성 (전처리 포함)
   */
  private async createDocument(
    content: string,
    link: string,
    domainName: string,
    category?: string
  ): Promise<KnowledgeDocument> {
    try {
      // 문서 전처리 수행
      const preprocessed = await this.preprocessor.preprocessDocument(link, content, domainName);
      
      // RemoteMarkdownDocument 생성
      const remoteDoc = createRemoteMarkdownDocument(
        `doc-${this.documentIdCounter}`,
        link,
        content
      );

      // 전처리된 메타데이터 통합
      if (remoteDoc.metadata) {
        remoteDoc.metadata.preprocessed = preprocessed.metadata;
        // 키워드 병합 (기존 + 전처리)
        remoteDoc.metadata.keywords = [
          ...new Set([
            ...remoteDoc.metadata.keywords,
            ...preprocessed.keywords
          ])
        ];
        // 설명 업데이트 (전처리 결과가 더 상세함)
        if (preprocessed.metadata.description) {
          remoteDoc.metadata.description = preprocessed.metadata.description;
        }
      }

      const document = new KnowledgeDocument(
        remoteDoc,
        this.documentIdCounter++,
        domainName
      );

      console.error(`[DEBUG] Created preprocessed document: ID=${document.id}, title=${document.title}, domainName=${document.domainName}, keywords=${document.keywords.length}, wordCount=${preprocessed.metadata.wordCount}`);

      return document;
    } catch (error) {
      console.error(`[DEBUG] Error in preprocessing document ${link}: ${(error as Error).message}`);
      
      // 전처리 실패시 기본 방식으로 폴백
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

      console.error(`[DEBUG] Created fallback document: ID=${document.id}, title=${document.title}, domainName=${document.domainName}`);

      return document;
    }
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
} 
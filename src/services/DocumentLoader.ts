import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../models/Document.js';
import { DomainDiscovery, DiscoveredDomain } from './DomainDiscovery.js';

export interface DocumentSource {
  type: 'local' | 'remote';
  basePath: string;
  domains: Array<{
    name: string;
    path: string;
    category?: string;
  }>;
  autoDiscovery?: boolean; // 자동 도메인 발견 활성화 여부
}

/**
 * 문서 로더
 * 로컬 파일 시스템 또는 원격 URL에서 마크다운 문서를 로드
 */
export class DocumentLoader {
  private documents: KnowledgeDocument[] = [];
  private documentIdCounter = 0;
  private domainDiscovery: DomainDiscovery;

  constructor(private readonly source: DocumentSource) {
    this.domainDiscovery = new DomainDiscovery(source.basePath);
  }

  /**
   * 모든 문서 로드
   */
  async loadAllDocuments(): Promise<KnowledgeDocument[]> {
    this.documents = [];
    this.documentIdCounter = 0;

    // 통합 도메인 목록 생성 (설정 파일 + 자동 발견)
    const allDomains = await this.getAllDomains();
    
    console.error(`[DEBUG] DocumentLoader.loadAllDocuments start. Domains to process: ${allDomains.length}`);
    for (const domain of allDomains) {
      console.error(`[DEBUG] Processing domain: ${domain.name}, path: ${domain.path}`);
      await this.loadDomainDocuments(domain);
      console.error(`[DEBUG] Completed domain: ${domain.name}. Total documents so far: ${this.documents.length}`);
    }

    console.error(`[DEBUG] DocumentLoader.loadAllDocuments completed. Total documents loaded: ${this.documents.length}`);
    return this.documents;
  }

  /**
   * 모든 도메인 목록 가져오기 (설정 파일 + 자동 발견)
   */
  private async getAllDomains(): Promise<Array<{name: string; path: string; category?: string}>> {
    const allDomains: Array<{name: string; path: string; category?: string}> = [];
    
    // 기존 설정 파일의 도메인 추가
    allDomains.push(...this.source.domains);
    
    // 자동 발견 활성화 시 추가 도메인 발견
    if (this.source.autoDiscovery !== false) { // 기본값: true
      console.error('[DEBUG] Auto-discovery enabled, scanning for additional domains');
      const discoveredDomains = await this.domainDiscovery.discoverDomains();
      
      for (const discovered of discoveredDomains) {
        // 이미 설정 파일에 있는 도메인은 제외
        const existingDomain = allDomains.find(d => d.name === discovered.name || d.path === discovered.path);
        if (!existingDomain) {
          allDomains.push({
            name: discovered.name,
            path: discovered.path,
            category: discovered.category
          });
          console.error(`[DEBUG] Added auto-discovered domain: ${discovered.name}`);
        } else {
          console.error(`[DEBUG] Skipped duplicate domain: ${discovered.name}`);
        }
      }
      
      const stats = this.domainDiscovery.getStats();
      console.error(`[DEBUG] Auto-discovery stats: ${JSON.stringify(stats)}`);
    }
    
    return allDomains;
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
          const document = this.createDocument(
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
          const document = this.createDocument(
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

    console.error(`[DEBUG] Created document: ID=${document.id}, title=${document.title}, domainName=${document.domainName}`);

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
} 
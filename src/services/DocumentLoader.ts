import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../models/Document.js';
import { DomainManager } from './DomainManager.js';
import { LLMClassificationService } from './LLMClassificationService.js';

/**
 * 간소화된 문서 소스 인터페이스
 */
export interface DocumentSource {
  type: 'local' | 'remote';
  basePath: string;
}

/**
 * 문서 로딩 결과
 */
export interface LoadingResult {
  documents: KnowledgeDocument[];
  newDomains: string[];
  classificationStats: {
    total: number;
    newlyClassified: number;
    existingMappings: number;
    failed: number;
  };
}

/**
 * 새로운 문서 로더
 * docs/ 폴더를 직접 스캔하고 LLM 기반 자동 분류를 수행
 */
export class DocumentLoader {
  private documents: KnowledgeDocument[] = [];
  private documentIdCounter = 0;

  constructor(
    private readonly source: DocumentSource,
    private readonly domainManager: DomainManager,
    private readonly classificationService: LLMClassificationService,
    private readonly autoClassify: boolean = true
  ) {}

  /**
   * 모든 문서 로드 및 자동 분류
   */
  async loadAllDocuments(): Promise<LoadingResult> {
    this.documents = [];
    this.documentIdCounter = 0;

    console.error(`[DEBUG] DocumentLoader: Starting auto-classification scan of ${this.source.basePath}`);

    const result: LoadingResult = {
      documents: [],
      newDomains: [],
      classificationStats: {
        total: 0,
        newlyClassified: 0,
        existingMappings: 0,
        failed: 0
      }
    };

    if (this.source.type === 'local') {
      await this.loadLocalDocumentsWithClassification(this.source.basePath, result);
    } else {
      await this.loadRemoteDocumentsWithClassification(this.source.basePath, result);
    }

    result.documents = this.documents;

    console.error(`[DEBUG] DocumentLoader: Completed loading ${result.documents.length} documents`);
    console.error(`[DEBUG] Classification stats:`, result.classificationStats);
    console.error(`[DEBUG] New domains created:`, result.newDomains);

    return result;
  }

  /**
   * 로컬 문서 로드 및 분류
   */
  private async loadLocalDocumentsWithClassification(
    dirPath: string,
    result: LoadingResult
  ): Promise<void> {
    try {
      if (!fsSync.existsSync(dirPath)) {
        console.error(`[DEBUG] Directory does not exist: ${dirPath}`);
        return;
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 하위 디렉토리 재귀적 탐색
          await this.loadLocalDocumentsWithClassification(fullPath, result);
        } else if (entry.isFile() && this.isMarkdownFile(entry.name)) {
          // 마크다운 파일 처리
          await this.processMarkdownFile(fullPath, result);
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load documents from ${dirPath}:`, (error as Error).message);
    }
  }

  /**
   * 원격 문서 로드 및 분류
   */
  private async loadRemoteDocumentsWithClassification(
    baseUrl: string,
    result: LoadingResult
  ): Promise<void> {
    try {
      // llms.txt 파일 로드 시도
      const llmsUrl = `${baseUrl}/llms.txt`;
      const response = await axios.get(llmsUrl);
      const llmsContent = response.data;

      // llms.txt 파싱하여 문서 URL 추출
      const documentUrls = this.parseLlmsTxt(llmsContent, baseUrl);

      // 각 문서 처리
      for (const docUrl of documentUrls) {
        try {
          const docResponse = await axios.get(docUrl);
          const content = docResponse.data;
          await this.processDocumentContent(content, docUrl, result);
        } catch (error) {
          console.error(`[DEBUG] Failed to load remote document ${docUrl}:`, (error as Error).message);
          result.classificationStats.failed++;
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load remote documents from ${baseUrl}:`, (error as Error).message);
    }
  }

  /**
   * 마크다운 파일 처리
   */
  private async processMarkdownFile(filePath: string, result: LoadingResult): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      await this.processDocumentContent(content, filePath, result);
    } catch (error) {
      console.error(`[DEBUG] Failed to process file ${filePath}:`, (error as Error).message);
      result.classificationStats.failed++;
    }
  }

  /**
   * 문서 내용 처리 및 분류
   */
  private async processDocumentContent(
    content: string,
    filePath: string,
    result: LoadingResult
  ): Promise<void> {
    result.classificationStats.total++;

    try {
      let domainName: string;
      
      // 기존 매핑 확인
      const existingMapping = this.domainManager.getDocumentDomain(filePath);
      
      if (existingMapping) {
        // 기존 매핑이 있으면 사용
        domainName = existingMapping.domainName;
        result.classificationStats.existingMappings++;
        console.error(`[DEBUG] Using existing mapping: ${filePath} -> ${domainName}`);
      } else if (this.autoClassify) {
        // 자동 분류 수행
        const classification = await this.classificationService.classifyDocument(content, filePath);
        domainName = classification.domainName;
        
        // 새 도메인이 생성되었는지 확인
        if (!this.domainManager.hasDomain(domainName)) {
          await this.domainManager.createDomain(
            domainName,
            classification.displayName,
            classification.description,
            classification.keywords
          );
          result.newDomains.push(domainName);
          console.error(`[DEBUG] Created new domain: ${domainName}`);
        }

        // 문서-도메인 매핑 저장
        await this.domainManager.assignDocumentToDomain(
          filePath,
          domainName,
          classification.confidence
        );
        
        result.classificationStats.newlyClassified++;
        console.error(`[DEBUG] Classified document: ${filePath} -> ${domainName} (confidence: ${classification.confidence})`);
      } else {
        // 자동 분류가 비활성화된 경우 기본 도메인 사용
        domainName = 'general';
        
        // 기본 도메인이 없으면 생성
        if (!this.domainManager.hasDomain('general')) {
          await this.domainManager.createDomain(
            'general',
            '일반 문서',
            '분류되지 않은 일반적인 문서들',
            ['general', 'misc', 'other']
          );
          result.newDomains.push('general');
        }

        await this.domainManager.assignDocumentToDomain(filePath, 'general', 0.5);
        result.classificationStats.newlyClassified++;
      }

      // 문서 객체 생성
      const document = this.createDocument(content, filePath, domainName);
      this.documents.push(document);

    } catch (error) {
      console.error(`[DEBUG] Failed to classify document ${filePath}:`, (error as Error).message);
      result.classificationStats.failed++;
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
    domainName: string
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

    console.error(`[DEBUG] Created document: ID=${document.id}, title=${document.title}, domain=${document.domainName}`);

    return document;
  }

  /**
   * 단일 문서 추가 및 분류
   */
  async addDocument(filePath: string): Promise<KnowledgeDocument | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // 분류 수행
      let domainName: string;
      const existingMapping = this.domainManager.getDocumentDomain(filePath);
      
      if (existingMapping) {
        domainName = existingMapping.domainName;
      } else if (this.autoClassify) {
        const classification = await this.classificationService.classifyDocument(content, filePath);
        domainName = classification.domainName;
        
        if (!this.domainManager.hasDomain(domainName)) {
          await this.domainManager.createDomain(
            domainName,
            classification.displayName,
            classification.description,
            classification.keywords
          );
        }

        await this.domainManager.assignDocumentToDomain(
          filePath,
          domainName,
          classification.confidence
        );
      } else {
        domainName = 'general';
        if (!this.domainManager.hasDomain('general')) {
          await this.domainManager.createDomain(
            'general',
            '일반 문서',
            '분류되지 않은 일반적인 문서들',
            ['general']
          );
        }
        await this.domainManager.assignDocumentToDomain(filePath, 'general', 0.5);
      }

      const document = this.createDocument(content, filePath, domainName);
      this.documents.push(document);
      
      return document;
    } catch (error) {
      console.error(`[DEBUG] Failed to add document ${filePath}:`, (error as Error).message);
      return null;
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
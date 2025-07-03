import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 문서 메타데이터 인터페이스
 */
export interface DocumentMetadata {
  title: string;
  description?: string;
  tags: string[];
  author?: string;
  createdAt?: Date;
  updatedAt?: Date;
  category?: string;
  wordCount: number;
  readingTime: number; // 분 단위
  headings: HeadingInfo[];
  codeBlocks: CodeBlockInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  tables: TableInfo[];
  language?: string;
  complexity: 'low' | 'medium' | 'high';
}

/**
 * 제목 정보
 */
export interface HeadingInfo {
  level: number;
  text: string;
  id?: string;
}

/**
 * 코드 블록 정보
 */
export interface CodeBlockInfo {
  language?: string;
  code: string;
  lineCount: number;
}

/**
 * 링크 정보
 */
export interface LinkInfo {
  text: string;
  url: string;
  isExternal: boolean;
}

/**
 * 이미지 정보
 */
export interface ImageInfo {
  alt: string;
  src: string;
  title?: string;
}

/**
 * 테이블 정보
 */
export interface TableInfo {
  headers: string[];
  rowCount: number;
  columnCount: number;
}

/**
 * 전처리된 문서 인터페이스
 */
export interface PreprocessedDocument {
  content: string;
  metadata: DocumentMetadata;
  keywords: string[];
  summary?: string;
}

/**
 * 문서 전처리 서비스
 * 마크다운 문서에서 메타데이터를 추출하고 키워드를 생성
 */
export class DocumentPreprocessor {
  private processor = unified().use(remarkParse);

  /**
   * 문서 전처리
   * @param filePath 파일 경로
   * @param content 문서 내용
   * @param domain 도메인 정보
   */
  async preprocessDocument(
    filePath: string, 
    content: string, 
    domain?: string
  ): Promise<PreprocessedDocument> {
    try {
      // 파일 정보 수집
      const fileStats = await this.getFileStats(filePath);
      
      // AST 파싱
      const ast = this.processor.parse(content);
      
      // 메타데이터 추출
      const metadata = await this.extractMetadata(ast, content, filePath, fileStats, domain);
      
      // 키워드 추출
      const keywords = this.extractKeywords(content, metadata);
      
      // 요약 생성 (선택적)
      const summary = this.generateSummary(content, metadata);
      
      return {
        content,
        metadata,
        keywords,
        summary
      };
    } catch (error) {
      console.error(`[DEBUG] Error preprocessing document ${filePath}: ${(error as Error).message}`);
      
      // 기본 메타데이터로 폴백
      const fallbackMetadata = this.createFallbackMetadata(filePath, content, domain);
      
      return {
        content,
        metadata: fallbackMetadata,
        keywords: this.extractBasicKeywords(content),
        summary: content.substring(0, 200) + '...'
      };
    }
  }

  /**
   * 파일 통계 정보 수집
   */
  private async getFileStats(filePath: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(filePath);
    } catch (error) {
      console.error(`[DEBUG] Failed to get file stats for ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 메타데이터 추출
   */
  private async extractMetadata(
    ast: any, 
    content: string, 
    filePath: string, 
    fileStats: fs.Stats | null,
    domain?: string
  ): Promise<DocumentMetadata> {
    const metadata: DocumentMetadata = {
      title: this.extractTitle(ast, filePath),
      tags: [],
      wordCount: this.countWords(content),
      readingTime: this.calculateReadingTime(content),
      headings: [],
      codeBlocks: [],
      links: [],
      images: [],
      tables: [],
      complexity: 'medium',
      category: domain
    };

    // 파일 시간 정보
    if (fileStats) {
      metadata.createdAt = fileStats.birthtime;
      metadata.updatedAt = fileStats.mtime;
    }

    // AST 순회하여 요소 추출
    visit(ast, (node: any) => {
      switch (node.type) {
        case 'heading':
          metadata.headings.push({
            level: node.depth,
            text: this.extractTextFromNode(node),
            id: this.generateId(this.extractTextFromNode(node))
          });
          break;

        case 'code':
          metadata.codeBlocks.push({
            language: node.lang,
            code: node.value,
            lineCount: node.value.split('\n').length
          });
          break;

        case 'link':
          const linkText = this.extractTextFromNode(node);
          metadata.links.push({
            text: linkText,
            url: node.url,
            isExternal: this.isExternalLink(node.url)
          });
          break;

        case 'image':
          metadata.images.push({
            alt: node.alt || '',
            src: node.url,
            title: node.title
          });
          break;

        case 'table':
          const tableInfo = this.extractTableInfo(node);
          metadata.tables.push(tableInfo);
          break;
      }
    });

    // 메타데이터에서 태그 추출
    metadata.tags = this.extractTags(content, metadata);
    
    // 복잡도 계산
    metadata.complexity = this.calculateComplexity(metadata);
    
    // 설명 추출
    metadata.description = this.extractDescription(content, metadata);

    return metadata;
  }

  /**
   * 제목 추출
   */
  private extractTitle(ast: any, filePath: string): string {
    let title = path.basename(filePath, path.extname(filePath));
    
    // 첫 번째 H1 헤딩을 제목으로 사용
    visit(ast, (node: any) => {
      if (node.type === 'heading' && node.depth === 1) {
        title = this.extractTextFromNode(node);
        return false; // 순회 중단
      }
    });

    return title;
  }

  /**
   * 노드에서 텍스트 추출
   */
  private extractTextFromNode(node: any): string {
    if (node.type === 'text') {
      return node.value;
    }
    
    if (node.children) {
      return node.children
        .map((child: any) => this.extractTextFromNode(child))
        .join('');
    }
    
    return '';
  }

  /**
   * 단어 수 계산
   */
  private countWords(content: string): number {
    // 마크다운 문법 제거 후 단어 수 계산
    const cleanContent = content
      .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
      .replace(/`[^`]*`/g, '') // 인라인 코드 제거
      .replace(/!\[.*?\]\(.*?\)/g, '') // 이미지 제거
      .replace(/\[.*?\]\(.*?\)/g, '') // 링크 제거
      .replace(/[#*_~`]/g, '') // 마크다운 문법 제거
      .replace(/\s+/g, ' ') // 연속 공백 정리
      .trim();
    
    if (!cleanContent) return 0;
    
    return cleanContent.split(/\s+/).length;
  }

  /**
   * 읽기 시간 계산 (분 단위)
   */
  private calculateReadingTime(content: string): number {
    const wordsPerMinute = 200; // 한국어 기준 분당 읽기 속도
    const wordCount = this.countWords(content);
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  /**
   * ID 생성
   */
  private generateId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  /**
   * 외부 링크 확인
   */
  private isExternalLink(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * 테이블 정보 추출
   */
  private extractTableInfo(node: any): TableInfo {
    const headers: string[] = [];
    let rowCount = 0;
    
    if (node.children && node.children.length > 0) {
      // 첫 번째 행에서 헤더 추출
      const firstRow = node.children[0];
      if (firstRow && firstRow.children) {
        firstRow.children.forEach((cell: any) => {
          headers.push(this.extractTextFromNode(cell));
        });
      }
      
      rowCount = node.children.length;
    }
    
    return {
      headers,
      rowCount,
      columnCount: headers.length
    };
  }

  /**
   * 태그 추출
   */
  private extractTags(content: string, metadata: DocumentMetadata): string[] {
    const tags = new Set<string>();
    
    // 기술 관련 키워드
    const techKeywords = [
      'api', 'rest', 'graphql', 'database', 'sql', 'nosql',
      'authentication', 'authorization', 'jwt', 'oauth',
      'docker', 'kubernetes', 'microservice', 'serverless',
      'react', 'vue', 'angular', 'node', 'python', 'java',
      'typescript', 'javascript', 'css', 'html',
      'git', 'ci/cd', 'devops', 'testing', 'unit test'
    ];
    
    // 비즈니스 관련 키워드
    const businessKeywords = [
      'payment', 'billing', 'subscription', 'customer',
      'product', 'service', 'pricing', 'marketing',
      'sales', 'support', 'analytics', 'dashboard'
    ];
    
    const allKeywords = [...techKeywords, ...businessKeywords];
    const lowerContent = content.toLowerCase();
    
    allKeywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) {
        tags.add(keyword);
      }
    });
    
    // 코드 언어를 태그로 추가
    metadata.codeBlocks.forEach(block => {
      if (block.language) {
        tags.add(block.language);
      }
    });
    
    // 헤딩에서 중요 키워드 추출
    metadata.headings.forEach(heading => {
      const words = heading.text.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3 && allKeywords.includes(word)) {
          tags.add(word);
        }
      });
    });
    
    return Array.from(tags);
  }

  /**
   * 복잡도 계산
   */
  private calculateComplexity(metadata: DocumentMetadata): 'low' | 'medium' | 'high' {
    let complexityScore = 0;
    
    // 단어 수 기반
    if (metadata.wordCount > 2000) complexityScore += 2;
    else if (metadata.wordCount > 500) complexityScore += 1;
    
    // 코드 블록 수 기반
    if (metadata.codeBlocks.length > 5) complexityScore += 2;
    else if (metadata.codeBlocks.length > 0) complexityScore += 1;
    
    // 헤딩 구조 기반
    const maxHeadingLevel = Math.max(...metadata.headings.map(h => h.level), 0);
    if (maxHeadingLevel > 3) complexityScore += 1;
    
    // 테이블과 이미지 수 기반
    if (metadata.tables.length > 2 || metadata.images.length > 5) {
      complexityScore += 1;
    }
    
    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * 설명 추출
   */
  private extractDescription(content: string, metadata: DocumentMetadata): string {
    // 첫 번째 단락을 설명으로 사용
    const lines = content.split('\n');
    let description = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 제목이나 메타데이터 스킵
      if (trimmed.startsWith('#') || trimmed.startsWith('---') || !trimmed) {
        continue;
      }
      
      // 첫 번째 의미있는 단락 발견
      if (trimmed.length > 20) {
        description = trimmed;
        break;
      }
    }
    
    // 길이 제한
    if (description.length > 200) {
      description = description.substring(0, 197) + '...';
    }
    
    return description || `${metadata.title}에 대한 문서입니다.`;
  }

  /**
   * 키워드 추출
   */
  private extractKeywords(content: string, metadata: DocumentMetadata): string[] {
    const keywords = new Set<string>();
    
    // 제목에서 키워드 추출
    const titleWords = metadata.title.toLowerCase().split(/\s+/);
    titleWords.forEach(word => {
      if (word.length > 2) keywords.add(word);
    });
    
    // 태그를 키워드로 추가
    metadata.tags.forEach(tag => keywords.add(tag));
    
    // 헤딩에서 키워드 추출
    metadata.headings.forEach(heading => {
      const words = heading.text.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) keywords.add(word);
      });
    });
    
    // 텍스트에서 빈도 기반 키워드 추출
    const frequentWords = this.extractFrequentWords(content);
    frequentWords.forEach(word => keywords.add(word));
    
    return Array.from(keywords);
  }

  /**
   * 빈도 기반 키워드 추출
   */
  private extractFrequentWords(content: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      '은', '는', '이', '가', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '하다', '있다', '되다'
    ]);
    
    const words = content
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // 빈도 계산
    const frequency: { [word: string]: number } = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // 빈도 순으로 정렬하여 상위 10개 반환
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 요약 생성
   */
  private generateSummary(content: string, metadata: DocumentMetadata): string {
    const sentences = content
      .replace(/[#*_`]/g, '') // 마크다운 문법 제거
      .split(/[.!?]\s+/)
      .filter(s => s.trim().length > 20)
      .slice(0, 3); // 첫 3개 문장
    
    let summary = sentences.join('. ');
    if (summary.length > 300) {
      summary = summary.substring(0, 297) + '...';
    }
    
    return summary || metadata.description || `${metadata.title}에 대한 문서입니다.`;
  }

  /**
   * 폴백 메타데이터 생성
   */
  private createFallbackMetadata(filePath: string, content: string, domain?: string): DocumentMetadata {
    return {
      title: path.basename(filePath, path.extname(filePath)),
      tags: [],
      wordCount: this.countWords(content),
      readingTime: this.calculateReadingTime(content),
      headings: [],
      codeBlocks: [],
      links: [],
      images: [],
      tables: [],
      complexity: 'medium',
      category: domain,
      description: content.substring(0, 200) + '...'
    };
  }

  /**
   * 기본 키워드 추출 (폴백용)
   */
  private extractBasicKeywords(content: string): string[] {
    return this.extractFrequentWords(content);
  }
}
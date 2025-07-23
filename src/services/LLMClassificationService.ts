import { extractMetadata } from '../utils/markdownParser.js';
import type { DomainManager, DomainInfo } from './DomainManager.js';

/**
 * LLM 분류 결과
 */
export interface LLMClassificationResult {
  domainName: string;
  displayName: string;
  description: string;
  keywords: string[];
  confidence: number;
  reasoning: string;
  contentType: 'technical' | 'business' | 'customer-support' | 'product' | 'policy' | 'guide' | 'reference' | 'other';
  language: 'ko' | 'en' | 'mixed' | 'other';
}

/**
 * 문서 분석 메타데이터
 */
export interface DocumentAnalysis {
  wordCount: number;
  headingCount: number;
  codeBlockCount: number;
  linkCount: number;
  hasImages: boolean;
  hasTables: boolean;
  primaryHeadings: string[];
  extractedKeywords: string[];
}

/**
 * LLM 기반 문서 분류 서비스
 * 문서 내용을 분석하여 적절한 도메인을 생성하거나 기존 도메인에 할당
 */
export class LLMClassificationService {
  constructor(private domainManager: DomainManager) {}

  /**
   * 문서를 분석하고 도메인을 분류
   * @param content 문서 내용
   * @param filePath 파일 경로 (컨텍스트용)
   * @returns 분류 결과
   */
  async classifyDocument(content: string, filePath: string): Promise<LLMClassificationResult> {
    // 1. 문서 분석
    const analysis = this.analyzeDocument(content);
    const metadata = extractMetadata(content);

    // 2. 기존 도메인과의 유사도 검사
    const existingDomains = this.domainManager.getAllDomains();
    const similarity = await this.findBestMatchingDomain(content, analysis, existingDomains);

    // 3. 기존 도메인 중 적합한 것이 있으면 사용
    if (similarity.score > 0.7) {
      return {
        domainName: similarity.domain.name,
        displayName: similarity.domain.displayName,
        description: similarity.domain.description,
        keywords: similarity.matchedKeywords,
        confidence: similarity.score,
        reasoning: `Matched existing domain: ${similarity.reason}`,
        contentType: this.determineContentType(content, analysis),
        language: this.detectLanguage(content)
      };
    }

    // 4. 새 도메인 생성이 필요한 경우
    const newDomain = await this.generateNewDomain(content, analysis, metadata, filePath);
    return newDomain;
  }

  /**
   * 문서 구조 및 내용 분석
   */
  private analyzeDocument(content: string): DocumentAnalysis {
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(word => word.length > 0);

    // 헤딩 추출
    const headings = lines
      .filter(line => line.trim().startsWith('#'))
      .map(line => line.replace(/^#+\s*/, '').trim())
      .slice(0, 5); // 상위 5개만

    // 코드 블록 수
    const codeBlockCount = (content.match(/```/g) || []).length / 2;

    // 링크 수
    const linkCount = (content.match(/\[.*?\]\(.*?\)/g) || []).length;

    // 이미지 존재 여부
    const hasImages = /!\[.*?\]\(.*?\)/.test(content);

    // 테이블 존재 여부
    const hasTables = /\|.*\|/.test(content);

    // 키워드 추출 (빈도 기반)
    const extractedKeywords = this.extractKeywords(content);

    return {
      wordCount: words.length,
      headingCount: headings.length,
      codeBlockCount,
      linkCount,
      hasImages,
      hasTables,
      primaryHeadings: headings,
      extractedKeywords
    };
  }

  /**
   * 기존 도메인과의 유사도 검사
   */
  private async findBestMatchingDomain(
    content: string,
    analysis: DocumentAnalysis,
    domains: DomainInfo[]
  ): Promise<{
    domain: DomainInfo;
    score: number;
    reason: string;
    matchedKeywords: string[];
  }> {
    let bestMatch = {
      domain: domains[0],
      score: 0,
      reason: '',
      matchedKeywords: [] as string[]
    };

    if (domains.length === 0) {
      return bestMatch;
    }

    const contentLower = content.toLowerCase();

    for (const domain of domains) {
      let score = 0;
      const matchedKeywords: string[] = [];
      const reasons: string[] = [];

      // 키워드 매칭 (40% 가중치)
      for (const keyword of domain.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = (contentLower.match(regex) || []).length;
        if (matches > 0) {
          score += matches * 0.1;
          matchedKeywords.push(keyword);
        }
      }

      // 도메인 이름 매칭 (20% 가중치)
      if (contentLower.includes(domain.name)) {
        score += 0.2;
        reasons.push(`domain name mentioned`);
      }

      // 설명과의 유사도 (20% 가중치)
      const descWords = domain.description.toLowerCase().split(/\s+/);
      const commonWords = descWords.filter(word => 
        word.length > 3 && contentLower.includes(word)
      );
      score += (commonWords.length / descWords.length) * 0.2;

      // 제목 유사도 (20% 가중치)
      const titleSimilarity = this.calculateTitleSimilarity(
        analysis.primaryHeadings,
        domain.keywords
      );
      score += titleSimilarity * 0.2;

      if (score > bestMatch.score) {
        bestMatch = {
          domain,
          score: Math.min(score, 1.0), // 최대 1.0으로 제한
          reason: reasons.join(', ') || `${matchedKeywords.length} keyword matches`,
          matchedKeywords
        };
      }
    }

    return bestMatch;
  }

  /**
   * 새 도메인 생성
   */
  private async generateNewDomain(
    content: string,
    analysis: DocumentAnalysis,
    metadata: any,
    filePath: string
  ): Promise<LLMClassificationResult> {
    // 간단한 패턴 기반 도메인 생성 (실제 LLM 대신)
    const contentType = this.determineContentType(content, analysis);
    const language = this.detectLanguage(content);
    
    // 파일 경로에서 힌트 얻기
    const pathParts = filePath.split(/[/\\]/).filter(part => part !== '');
    const fileName = pathParts[pathParts.length - 1].replace(/\.[^.]+$/, '');
    
    // 주요 키워드 추출
    const keywords = analysis.extractedKeywords.slice(0, 10);
    
    // 도메인 이름 생성 로직
    let domainName = '';
    let displayName = '';
    let description = '';

    if (contentType === 'technical') {
      domainName = this.generateTechnicalDomainName(content, analysis, fileName);
      displayName = `기술 문서 - ${domainName}`;
      description = `기술적 내용과 구현 세부사항을 다루는 문서들`;
    } else if (contentType === 'business') {
      domainName = this.generateBusinessDomainName(content, analysis, fileName);
      displayName = `비즈니스 - ${domainName}`;
      description = `비즈니스 프로세스와 정책을 다루는 문서들`;
    } else if (contentType === 'customer-support') {
      domainName = 'customer-support';
      displayName = '고객 지원';
      description = '고객 지원, FAQ, 문제 해결 가이드';
    } else if (contentType === 'product') {
      domainName = this.generateProductDomainName(content, analysis, fileName);
      displayName = `제품 정보 - ${domainName}`;
      description = `제품 기능, 사용법, 가이드 문서들`;
    } else {
      domainName = this.generateGeneralDomainName(content, analysis, fileName);
      displayName = `일반 - ${domainName}`;
      description = `기타 일반적인 내용의 문서들`;
    }

    // 도메인 이름 정규화
    domainName = this.normalizeDomainName(domainName);

    // 중복 방지
    let finalDomainName = domainName;
    let counter = 1;
    while (this.domainManager.hasDomain(finalDomainName)) {
      finalDomainName = `${domainName}-${counter}`;
      counter++;
    }

    return {
      domainName: finalDomainName,
      displayName,
      description,
      keywords,
      confidence: 0.8, // 새 도메인 생성 시 기본 신뢰도
      reasoning: `Generated new domain based on content analysis: ${contentType}`,
      contentType,
      language
    };
  }

  /**
   * 기술 문서 도메인 이름 생성
   */
  private generateTechnicalDomainName(content: string, analysis: DocumentAnalysis, fileName: string): string {
    const techKeywords = ['api', 'sdk', 'framework', 'library', 'architecture', 'deployment', 'database'];
    const foundTechKeywords = techKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    );

    if (foundTechKeywords.length > 0) {
      return foundTechKeywords[0];
    }

    if (analysis.codeBlockCount > 3) {
      return 'development';
    }

    return fileName.includes('api') ? 'api' : 'technical';
  }

  /**
   * 비즈니스 문서 도메인 이름 생성
   */
  private generateBusinessDomainName(content: string, _analysis: DocumentAnalysis, _fileName: string): string {
    const bizKeywords = ['policy', 'process', 'strategy', 'management', 'organization', 'company'];
    const foundBizKeywords = bizKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    );

    if (foundBizKeywords.length > 0) {
      return foundBizKeywords[0];
    }

    return 'business';
  }

  /**
   * 제품 문서 도메인 이름 생성
   */
  private generateProductDomainName(content: string, _analysis: DocumentAnalysis, _fileName: string): string {
    const productKeywords = ['feature', 'guide', 'tutorial', 'manual', 'specification', 'overview'];
    const foundProductKeywords = productKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    );

    if (foundProductKeywords.length > 0) {
      return foundProductKeywords[0];
    }

    return 'product';
  }

  /**
   * 일반 도메인 이름 생성
   */
  private generateGeneralDomainName(content: string, analysis: DocumentAnalysis, fileName: string): string {
    // 주요 헤딩에서 도메인 이름 추출 시도
    if (analysis.primaryHeadings.length > 0) {
      const firstHeading = analysis.primaryHeadings[0].toLowerCase();
      const words = firstHeading.split(/\s+/).filter(word => word.length > 2);
      if (words.length > 0) {
        return words[0];
      }
    }

    // 파일명에서 추출
    return fileName || 'general';
  }

  /**
   * 콘텐츠 타입 결정
   */
  private determineContentType(content: string, analysis: DocumentAnalysis): LLMClassificationResult['contentType'] {
    const contentLower = content.toLowerCase();

    // 기술 문서 패턴
    if (analysis.codeBlockCount > 2 || 
        contentLower.includes('api') || 
        contentLower.includes('function') ||
        contentLower.includes('class') ||
        contentLower.includes('method')) {
      return 'technical';
    }

    // 고객 지원 패턴
    if (contentLower.includes('faq') ||
        contentLower.includes('support') ||
        contentLower.includes('help') ||
        contentLower.includes('troubleshoot') ||
        contentLower.includes('문의') ||
        contentLower.includes('지원')) {
      return 'customer-support';
    }

    // 제품 문서 패턴
    if (contentLower.includes('guide') ||
        contentLower.includes('tutorial') ||
        contentLower.includes('manual') ||
        contentLower.includes('feature') ||
        contentLower.includes('가이드') ||
        contentLower.includes('사용법')) {
      return 'product';
    }

    // 정책 문서 패턴
    if (contentLower.includes('policy') ||
        contentLower.includes('terms') ||
        contentLower.includes('agreement') ||
        contentLower.includes('정책') ||
        contentLower.includes('약관')) {
      return 'policy';
    }

    // 비즈니스 문서 패턴
    if (contentLower.includes('company') ||
        contentLower.includes('business') ||
        contentLower.includes('organization') ||
        contentLower.includes('strategy') ||
        contentLower.includes('회사') ||
        contentLower.includes('사업')) {
      return 'business';
    }

    return 'other';
  }

  /**
   * 언어 감지
   */
  private detectLanguage(content: string): LLMClassificationResult['language'] {
    const koreanChars = (content.match(/[가-힣]/g) || []).length;
    const englishWords = (content.match(/\b[a-zA-Z]+\b/g) || []).length;
    const totalChars = content.replace(/\s/g, '').length;

    if (koreanChars > totalChars * 0.3) {
      return englishWords > koreanChars * 0.5 ? 'mixed' : 'ko';
    } else if (englishWords > 10) {
      return 'en';
    } else {
      return 'other';
    }
  }

  /**
   * 키워드 추출 (빈도 기반)
   */
  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const frequency: Record<string, number> = {};
    
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // 빈도순으로 정렬하고 상위 키워드 반환
    return Object.entries(frequency)
      .filter(([_word, count]) => count > 1) // 최소 2번 이상 등장
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([word]) => word);
  }

  /**
   * 제목 유사도 계산
   */
  private calculateTitleSimilarity(headings: string[], keywords: string[]): number {
    if (headings.length === 0 || keywords.length === 0) {
      return 0;
    }

    const headingWords = headings
      .join(' ')
      .toLowerCase()
      .split(/\s+/);

    const matches = keywords.filter(keyword => 
      headingWords.some(word => word.includes(keyword) || keyword.includes(word))
    );

    return matches.length / keywords.length;
  }

  /**
   * 도메인 이름 정규화
   */
  private normalizeDomainName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\-가-힣]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50); // 최대 길이 제한
  }
}
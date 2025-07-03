import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';

/**
 * 카테고리 매핑 타입
 */
export interface CategoryMapping {
  [domainName: string]: string;
}

/**
 * 카테고리 매핑 서비스
 * 도메인명을 카테고리명으로 매핑하는 서비스
 */
export class CategoryMappingService {
  private cache: Map<string, CategoryMapping> = new Map();
  
  /**
   * 기본 카테고리 매핑
   */
  private readonly defaultMapping: CategoryMapping = {
    company: '회사정보',
    customer: '고객서비스',
    product: '제품정보',
    technical: '기술문서',
    service: '서비스',
    support: '지원',
    api: 'API문서',
    guide: '가이드',
    tutorial: '튜토리얼',
    faq: '자주묻는질문',
    news: '뉴스',
    blog: '블로그',
    policy: '정책',
    legal: '법적정보',
    security: '보안',
    privacy: '개인정보',
    terms: '이용약관',
    marketing: '마케팅',
    sales: '영업',
    hr: '인사',
    finance: '재무',
    operations: '운영',
    development: '개발',
    design: '디자인',
    research: '연구',
    training: '교육',
    documentation: '문서화'
  };

  /**
   * 카테고리 매핑 로드
   * @param basePath 문서 기본 경로
   * @returns 카테고리 매핑 객체
   */
  async loadMapping(basePath: string): Promise<CategoryMapping> {
    const cacheKey = basePath;
    
    // 캐시 확인
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let mapping: CategoryMapping = { ...this.defaultMapping };
    
    try {
      const categoryMappingPath = path.resolve(path.dirname(basePath), 'categoryMapping.json');
      
      if (fsSync.existsSync(categoryMappingPath)) {
        const mappingContent = await fs.readFile(categoryMappingPath, 'utf-8');
        const customMapping = JSON.parse(mappingContent);
        
        // 유효성 검사
        if (this.isValidMapping(customMapping)) {
          mapping = { ...this.defaultMapping, ...customMapping };
          console.error(`[DEBUG] CategoryMappingService: 커스텀 매핑 로드 성공 - ${categoryMappingPath}`);
        } else {
          console.error(`[DEBUG] CategoryMappingService: 유효하지 않은 매핑 파일 - ${categoryMappingPath}`);
        }
      }
    } catch (error) {
      console.error(`[DEBUG] CategoryMappingService: 매핑 로드 실패 - ${(error as Error).message}`);
    }

    // 캐시에 저장
    this.cache.set(cacheKey, mapping);
    return mapping;
  }

  /**
   * 도메인명을 카테고리명으로 변환
   * @param domainName 도메인명
   * @param mapping 카테고리 매핑
   * @returns 카테고리명
   */
  getCategory(domainName: string, mapping: CategoryMapping): string {
    return mapping[domainName] || domainName;
  }

  /**
   * 카테고리 매핑 유효성 검사
   * @param mapping 검사할 매핑 객체
   * @returns 유효성 여부
   */
  private isValidMapping(mapping: any): mapping is CategoryMapping {
    if (!mapping || typeof mapping !== 'object') {
      return false;
    }

    // 모든 키와 값이 문자열인지 확인
    for (const [key, value] of Object.entries(mapping)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return false;
      }
      
      // 키가 유효한 도메인명인지 확인 (영숫자, 하이픈, 언더스코어만 허용)
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 기본 매핑 반환
   */
  getDefaultMapping(): CategoryMapping {
    return { ...this.defaultMapping };
  }
}
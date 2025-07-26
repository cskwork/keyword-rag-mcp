/**
 * 도메인 폴더명을 기반으로 한국어 카테고리를 자동 매핑하는 유틸리티
 */

export interface CategoryMapping {
  patterns: string[];
  category: string;
}

/**
 * 기본 카테고리 매핑 규칙
 * 폴더명 패턴에 따라 적절한 한국어 카테고리를 자동 할당
 */
const defaultCategoryMappings: CategoryMapping[] = [
  // 회사 정보 관련
  {
    patterns: ['company', 'corporate', 'about', 'organization', 'org', '회사', '기업'],
    category: '회사정보'
  },
  
  // 고객 서비스 관련  
  {
    patterns: ['customer', 'client', 'support', 'service', 'help', 'faq', '고객', '서비스', '지원'],
    category: '고객서비스'
  },
  
  // 제품 정보 관련
  {
    patterns: ['product', 'products', 'features', 'solution', 'solutions', '제품', '상품', '솔루션'],
    category: '제품정보'
  },
  
  // 기술 문서 관련
  {
    patterns: ['technical', 'tech', 'api', 'dev', 'developer', 'docs', 'documentation', 'guide', 'tutorial', '기술', '개발', '문서'],
    category: '기술문서'
  },
  
  // 마케팅 관련
  {
    patterns: ['marketing', 'promotion', 'campaign', 'content', '마케팅', '홍보', '콘텐츠'],
    category: '마케팅'
  },
  
  // 운영 관련
  {
    patterns: ['operation', 'ops', 'admin', 'management', 'policy', 'procedure', '운영', '관리', '정책'],
    category: '운영관리'
  },
  
  // 재무/법무 관련
  {
    patterns: ['finance', 'financial', 'legal', 'contract', 'agreement', '재무', '법무', '계약'],
    category: '재무법무'
  }
];

/**
 * 기본 카테고리 (매핑되지 않는 경우 사용)
 */
const DEFAULT_CATEGORY = '일반문서';

/**
 * 카테고리 매퍼 클래스
 */
export class CategoryMapper {
  private mappings: CategoryMapping[];

  constructor(customMappings?: CategoryMapping[]) {
    // 사용자 정의 매핑이 있으면 기본 매핑과 병합
    this.mappings = customMappings 
      ? [...customMappings, ...defaultCategoryMappings]
      : defaultCategoryMappings;
  }

  /**
   * 도메인 이름을 기반으로 카테고리를 자동 할당
   * @param domainName 도메인 폴더명
   * @returns 할당된 한국어 카테고리
   */
  mapCategory(domainName: string): string {
    const normalizedName = domainName.toLowerCase().trim();
    
    // 각 매핑 규칙에 대해 패턴 매칭 시도
    for (const mapping of this.mappings) {
      for (const pattern of mapping.patterns) {
        // 정확한 매치 또는 부분 매치 확인
        if (normalizedName === pattern.toLowerCase() || 
            normalizedName.includes(pattern.toLowerCase()) ||
            pattern.toLowerCase().includes(normalizedName)) {
          return mapping.category;
        }
      }
    }
    
    // 매칭되는 패턴이 없으면 기본 카테고리 반환
    return DEFAULT_CATEGORY;
  }

  /**
   * 사용자 정의 매핑 규칙 추가
   * @param mapping 새로운 매핑 규칙
   */
  addMapping(mapping: CategoryMapping): void {
    this.mappings.unshift(mapping); // 새 규칙을 앞에 추가하여 우선순위 부여
  }

  /**
   * 현재 매핑 규칙들 조회
   * @returns 현재 설정된 모든 매핑 규칙
   */
  getMappings(): CategoryMapping[] {
    return [...this.mappings]; // 복사본 반환
  }

  /**
   * 기본 카테고리 조회
   * @returns 기본 카테고리명
   */
  getDefaultCategory(): string {
    return DEFAULT_CATEGORY;
  }

  /**
   * 모든 사용 가능한 카테고리 목록 조회
   * @returns 중복 제거된 카테고리 목록
   */
  getAllCategories(): string[] {
    const categories = new Set(this.mappings.map(m => m.category));
    categories.add(DEFAULT_CATEGORY);
    return Array.from(categories).sort();
  }
}

/**
 * 기본 카테고리 매퍼 인스턴스 (싱글톤)
 */
export const defaultCategoryMapper = new CategoryMapper();
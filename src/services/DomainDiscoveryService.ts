import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { CategoryMappingService, CategoryMapping } from './CategoryMappingService.js';

/**
 * 도메인 정보 타입
 */
export interface Domain {
  name: string;
  path: string;
  category: string;
}

/**
 * 도메인 탐지 서비스
 * 파일 시스템에서 도메인을 자동으로 탐지하는 서비스
 */
export class DomainDiscoveryService {
  constructor(private readonly categoryMappingService: CategoryMappingService) {}

  /**
   * 도메인 자동 탐지
   * @param basePath 문서 기본 경로
   * @returns 탐지된 도메인 목록
   */
  async discoverDomains(basePath: string): Promise<Domain[]> {
    try {
      console.error(`[DEBUG] DomainDiscoveryService: 도메인 탐지 시작 - ${basePath}`);
      
      // 기본 경로 유효성 검사
      if (!this.isValidBasePath(basePath)) {
        console.error(`[DEBUG] DomainDiscoveryService: 유효하지 않은 기본 경로 - ${basePath}`);
        return [];
      }

      // 카테고리 매핑 로드
      const categoryMapping = await this.categoryMappingService.loadMapping(basePath);
      
      // 디렉토리 스캔
      const domains = await this.scanDirectories(basePath, categoryMapping);
      
      console.error(`[DEBUG] DomainDiscoveryService: 탐지 완료 - ${domains.length}개 도메인 발견`);
      
      return domains;
    } catch (error) {
      console.error(`[DEBUG] DomainDiscoveryService: 탐지 실패 - ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 디렉토리 스캔
   * @param basePath 기본 경로
   * @param categoryMapping 카테고리 매핑
   * @returns 도메인 목록
   */
  private async scanDirectories(basePath: string, categoryMapping: CategoryMapping): Promise<Domain[]> {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const domains: Domain[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && this.isValidDomainDirectory(entry.name)) {
        const domain = this.createDomain(entry.name, categoryMapping);
        domains.push(domain);
        
        console.error(`[DEBUG] DomainDiscoveryService: 도메인 발견 - ${domain.name} -> ${domain.category}`);
      }
    }

    return this.sortDomains(domains);
  }

  /**
   * 도메인 객체 생성
   * @param directoryName 디렉토리명
   * @param categoryMapping 카테고리 매핑
   * @returns 도메인 객체
   */
  private createDomain(directoryName: string, categoryMapping: CategoryMapping): Domain {
    const domainName = this.normalizeDomainName(directoryName);
    const category = this.categoryMappingService.getCategory(domainName, categoryMapping);

    return {
      name: domainName,
      path: directoryName,
      category: category
    };
  }

  /**
   * 기본 경로 유효성 검사
   * @param basePath 검사할 경로
   * @returns 유효성 여부
   */
  private isValidBasePath(basePath: string): boolean {
    if (!basePath || typeof basePath !== 'string') {
      return false;
    }

    if (!fsSync.existsSync(basePath)) {
      return false;
    }

    const stats = fsSync.statSync(basePath);
    return stats.isDirectory();
  }

  /**
   * 유효한 도메인 디렉토리인지 확인
   * @param directoryName 디렉토리명
   * @returns 유효성 여부
   */
  private isValidDomainDirectory(directoryName: string): boolean {
    // 숨겨진 파일/디렉토리 제외
    if (directoryName.startsWith('.')) {
      return false;
    }

    // 시스템 디렉토리 제외
    const excludedDirectories = ['node_modules', 'dist', 'build', '.git', '.vscode', 'temp', 'tmp'];
    if (excludedDirectories.includes(directoryName.toLowerCase())) {
      return false;
    }

    // 유효한 도메인명 패턴 확인 (영문자로 시작, 영숫자, 하이픈, 언더스코어만 허용)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(directoryName)) {
      return false;
    }

    return true;
  }

  /**
   * 도메인명 정규화
   * @param directoryName 디렉토리명
   * @returns 정규화된 도메인명
   */
  private normalizeDomainName(directoryName: string): string {
    return directoryName.toLowerCase().trim();
  }

  /**
   * 도메인 목록 정렬
   * @param domains 정렬할 도메인 목록
   * @returns 정렬된 도메인 목록
   */
  private sortDomains(domains: Domain[]): Domain[] {
    return domains.sort((a, b) => {
      // 우선순위: company > customer > product > technical > 나머지 알파벳순
      const priorityOrder = ['company', 'customer', 'product', 'technical'];
      const aIndex = priorityOrder.indexOf(a.name);
      const bIndex = priorityOrder.indexOf(b.name);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * 도메인 통계 정보 반환
   * @param domains 도메인 목록
   * @returns 통계 정보
   */
  getDiscoveryStats(domains: Domain[]): {
    totalDomains: number;
    categorizedDomains: number;
    uncategorizedDomains: number;
    categories: string[];
  } {
    const categorizedDomains = domains.filter(d => d.category !== d.name);
    const categories = [...new Set(domains.map(d => d.category))];

    return {
      totalDomains: domains.length,
      categorizedDomains: categorizedDomains.length,
      uncategorizedDomains: domains.length - categorizedDomains.length,
      categories: categories.sort()
    };
  }
}
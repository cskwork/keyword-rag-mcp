import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';

/**
 * 도메인 정보 인터페이스
 */
export interface DiscoveredDomain {
  name: string;
  path: string;
  category?: string;
  fullPath: string;
  isNested: boolean;
  parentDomain?: string;
  level: number;
  metadata?: DomainMetadata;
}

/**
 * 도메인 메타데이터 (.domain.json 파일)
 */
export interface DomainMetadata {
  category?: string;
  description?: string;
  tags?: string[];
  priority?: number;
  enabled?: boolean;
}

/**
 * 도메인 자동 발견 서비스
 * docs/ 폴더 구조를 스캔하여 도메인을 자동으로 등록
 */
export class DomainDiscovery {
  private discoveredDomains: DiscoveredDomain[] = [];
  private domainCache: Map<string, DiscoveredDomain> = new Map();

  constructor(private readonly basePath: string) {}

  /**
   * 모든 도메인 자동 발견
   */
  async discoverDomains(): Promise<DiscoveredDomain[]> {
    console.error('[DEBUG] DomainDiscovery.discoverDomains started');
    
    this.discoveredDomains = [];
    this.domainCache.clear();

    if (!fsSync.existsSync(this.basePath)) {
      console.error(`[DEBUG] Base path does not exist: ${this.basePath}`);
      return [];
    }

    try {
      await this.scanDirectory(this.basePath, '', 0);
      console.error(`[DEBUG] DomainDiscovery completed. Found ${this.discoveredDomains.length} domains`);
      return this.discoveredDomains;
    } catch (error) {
      console.error('[DEBUG] Failed to discover domains:', (error as Error).message);
      return [];
    }
  }

  /**
   * 디렉토리 재귀 스캔
   */
  private async scanDirectory(
    currentPath: string,
    relativePath: string,
    level: number
  ): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      // 현재 디렉토리에 마크다운 파일이 있는지 확인
      const hasMarkdownFiles = await this.hasMarkdownFiles(currentPath);
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(currentPath, entry.name);
          const subRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          
          // 하위 디렉토리에 마크다운 파일이 있는지 확인
          const hasContent = await this.hasMarkdownFilesRecursive(subPath);
          
          if (hasContent) {
            // 도메인 메타데이터 로드
            const metadata = await this.loadDomainMetadata(subPath);
            
            // 도메인 정보 생성
            const domain: DiscoveredDomain = {
              name: this.generateDomainName(subRelativePath),
              path: subRelativePath,
              category: metadata?.category || this.generateCategory(entry.name),
              fullPath: subPath,
              isNested: level > 0,
              parentDomain: level > 0 ? this.getParentDomainName(relativePath) : undefined,
              level,
              metadata
            };

            // 활성화된 도메인만 추가 (기본값: true)
            if (metadata?.enabled !== false) {
              this.discoveredDomains.push(domain);
              this.domainCache.set(domain.name, domain);
              console.error(`[DEBUG] Discovered domain: ${domain.name} (level: ${level})`);
            }
          }
          
          // 하위 디렉토리 재귀 탐색
          await this.scanDirectory(subPath, subRelativePath, level + 1);
        }
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to scan directory ${currentPath}:`, (error as Error).message);
    }
  }

  /**
   * 디렉토리에 마크다운 파일이 있는지 확인
   */
  private async hasMarkdownFiles(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.some(entry => 
        entry.isFile() && this.isMarkdownFile(entry.name)
      );
    } catch {
      return false;
    }
  }

  /**
   * 디렉토리 및 하위 디렉토리에 마크다운 파일이 있는지 재귀적으로 확인
   */
  private async hasMarkdownFilesRecursive(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // 현재 디렉토리에 마크다운 파일이 있는지 확인
      const hasCurrentMarkdown = entries.some(entry => 
        entry.isFile() && this.isMarkdownFile(entry.name)
      );
      
      if (hasCurrentMarkdown) {
        return true;
      }

      // 하위 디렉토리 재귀 확인
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(dirPath, entry.name);
          const hasSubMarkdown = await this.hasMarkdownFilesRecursive(subPath);
          if (hasSubMarkdown) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 도메인 메타데이터 로드 (.domain.json 파일)
   */
  private async loadDomainMetadata(domainPath: string): Promise<DomainMetadata | undefined> {
    try {
      const metadataPath = path.join(domainPath, '.domain.json');
      if (fsSync.existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(content) as DomainMetadata;
        console.error(`[DEBUG] Loaded domain metadata from ${metadataPath}`);
        return metadata;
      }
    } catch (error) {
      console.error(`[DEBUG] Failed to load domain metadata from ${domainPath}:`, (error as Error).message);
    }
    return undefined;
  }

  /**
   * 도메인 이름 생성 (계층적 구조 지원)
   */
  private generateDomainName(relativePath: string): string {
    return relativePath.replace(/\//g, '.');
  }

  /**
   * 부모 도메인 이름 생성
   */
  private getParentDomainName(relativePath: string): string | undefined {
    const parts = relativePath.split('/');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('.');
    }
    return undefined;
  }

  /**
   * 카테고리 자동 생성
   */
  private generateCategory(folderName: string): string {
    const categoryMap: { [key: string]: string } = {
      // 기본 도메인
      'company': '회사정보',
      'customer': '고객서비스',
      'product': '제품정보',
      'technical': '기술문서',
      
      // 일반적인 폴더명
      'api': 'API문서',
      'guide': '가이드',
      'manual': '사용설명서',
      'policy': '정책문서',
      'process': '프로세스',
      'security': '보안문서',
      'finance': '재무정보',
      'hr': '인사관리',
      'marketing': '마케팅',
      'sales': '영업자료',
      'support': '지원문서',
      'training': '교육자료',
      'legal': '법무문서',
      'others': '기타문서',
      'other': '기타문서',
      'misc': '기타문서',
      
      // 개발 관련
      'docs': '문서',
      'documentation': '문서',
      'readme': '설명서',
      'tutorial': '튜토리얼',
      'example': '예제',
      'sample': '샘플',
      'demo': '데모',
      'test': '테스트',
      'spec': '명세서',
      'specification': '명세서',
      
      // 비즈니스 관련
      'business': '비즈니스',
      'operation': '운영',
      'admin': '관리',
      'management': '관리',
      'strategy': '전략',
      'planning': '기획',
      'project': '프로젝트',
      'workflow': '워크플로우',
      'procedure': '절차',
      
      // 기타
      'faq': 'FAQ',
      'help': '도움말',
      'howto': '사용법',
      'tips': '팁',
      'best-practices': '모범사례',
      'guidelines': '가이드라인',
      'standards': '표준',
      'reference': '참고자료',
      'resources': '자료',
      'templates': '템플릿',
      'archive': '아카이브',
      'backup': '백업',
      'old': '구버전',
      'deprecated': '구버전'
    };

    // 폴더명을 소문자로 변환하고 특수문자 제거
    const cleanFolderName = folderName.toLowerCase().replace(/[_-]/g, '');
    
    // 직접 매칭
    if (categoryMap[cleanFolderName]) {
      return categoryMap[cleanFolderName];
    }
    
    // 부분 매칭 (포함 관계)
    for (const [key, value] of Object.entries(categoryMap)) {
      if (cleanFolderName.includes(key) || key.includes(cleanFolderName)) {
        return value;
      }
    }
    
    // 기본값: 폴더명을 한글로 변환
    return this.convertToKoreanCategory(folderName);
  }

  /**
   * 폴더명을 한글 카테고리로 변환
   */
  private convertToKoreanCategory(folderName: string): string {
    // 영어 폴더명의 경우 한글 변환 시도
    const englishToKorean: { [key: string]: string } = {
      'news': '뉴스',
      'blog': '블로그',
      'notice': '공지사항',
      'announcement': '공지사항',
      'event': '이벤트',
      'promotion': '프로모션',
      'release': '릴리스',
      'update': '업데이트',
      'version': '버전',
      'changelog': '변경사항',
      'history': '히스토리',
      'log': '로그',
      'report': '보고서',
      'analysis': '분석',
      'research': '리서치',
      'survey': '설문조사',
      'feedback': '피드백',
      'review': '리뷰',
      'case': '사례',
      'study': '연구',
      'white-paper': '백서',
      'presentation': '발표자료',
      'slide': '슬라이드',
      'meeting': '회의',
      'minutes': '회의록',
      'agenda': '안건',
      'proposal': '제안서',
      'contract': '계약서',
      'agreement': '협약서',
      'terms': '약관',
      'privacy': '개인정보',
      'license': '라이선스',
      'copyright': '저작권'
    };

    const cleanName = folderName.toLowerCase().replace(/[_-]/g, '');
    
    for (const [eng, kor] of Object.entries(englishToKorean)) {
      if (cleanName.includes(eng.replace('-', ''))) {
        return kor;
      }
    }
    
    // 최종 기본값: 폴더명 + '문서'
    return `${folderName} 문서`;
  }

  /**
   * 마크다운 파일 여부 확인
   */
  private isMarkdownFile(filename: string): boolean {
    const extensions = ['.md', '.mdx', '.markdown'];
    return extensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * 발견된 도메인 목록 반환
   */
  getDiscoveredDomains(): DiscoveredDomain[] {
    return this.discoveredDomains;
  }

  /**
   * 특정 도메인 조회
   */
  getDomain(domainName: string): DiscoveredDomain | undefined {
    return this.domainCache.get(domainName);
  }

  /**
   * 도메인 통계 정보
   */
  getStats(): {
    totalDomains: number;
    nestedDomains: number;
    rootDomains: number;
    enabledDomains: number;
  } {
    const nested = this.discoveredDomains.filter(d => d.isNested).length;
    const root = this.discoveredDomains.filter(d => !d.isNested).length;
    const enabled = this.discoveredDomains.filter(d => d.metadata?.enabled !== false).length;

    return {
      totalDomains: this.discoveredDomains.length,
      nestedDomains: nested,
      rootDomains: root,
      enabledDomains: enabled
    };
  }
}
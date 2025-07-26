import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import { CategoryMapper, defaultCategoryMapper } from '../utils/categoryMapper.js';

/**
 * 도메인 정보 인터페이스
 */
export interface DiscoveredDomain {
  name: string;
  path: string;
  category: string;
  isAutoDiscovered: boolean;
  documentCount?: number;
}

/**
 * 도메인 발견 옵션
 */
export interface DomainDiscoveryOptions {
  categoryMapper?: CategoryMapper;
  includeEmpty?: boolean;  // 빈 폴더도 포함할지 여부
  maxDepth?: number;       // 탐색할 최대 깊이
  excludePatterns?: string[]; // 제외할 폴더 패턴
}

/**
 * 도메인 자동 발견 서비스
 * 지정된 디렉토리를 스캔하여 도메인을 자동으로 발견하고 설정을 생성
 */
export class DomainDiscoveryService {
  private categoryMapper: CategoryMapper;
  private options: Required<DomainDiscoveryOptions>;

  constructor(options: DomainDiscoveryOptions = {}) {
    this.categoryMapper = options.categoryMapper || defaultCategoryMapper;
    this.options = {
      categoryMapper: this.categoryMapper,
      includeEmpty: options.includeEmpty ?? false,
      maxDepth: options.maxDepth ?? 2,
      excludePatterns: options.excludePatterns ?? [
        '.git', '.vscode', 'node_modules', '.DS_Store', 'Thumbs.db'
      ]
    };
  }

  /**
   * 지정된 기본 경로에서 도메인들을 자동 발견
   * @param basePath 스캔할 기본 디렉토리 경로
   * @returns 발견된 도메인 목록
   */
  async discoverDomains(basePath: string): Promise<DiscoveredDomain[]> {
    console.error(`[DEBUG] DomainDiscoveryService: Starting domain discovery in ${basePath}`);
    
    if (!fsSync.existsSync(basePath)) {
      console.error(`[DEBUG] DomainDiscoveryService: Base path does not exist: ${basePath}`);
      return [];
    }

    if (!fsSync.statSync(basePath).isDirectory()) {
      console.error(`[DEBUG] DomainDiscoveryService: Base path is not a directory: ${basePath}`);
      return [];
    }

    try {
      const discoveredDomains: DiscoveredDomain[] = [];
      await this.scanDirectory(basePath, '', discoveredDomains, 0);
      
      console.error(`[DEBUG] DomainDiscoveryService: Discovered ${discoveredDomains.length} domains`);
      return discoveredDomains;
    } catch (error) {
      console.error(`[DEBUG] DomainDiscoveryService: Error during discovery:`, error);
      return [];
    }
  }

  /**
   * 디렉토리를 재귀적으로 스캔하여 도메인을 찾음
   * @param currentPath 현재 스캔 중인 경로
   * @param relativePath 기본 경로로부터의 상대 경로
   * @param domains 발견된 도메인들을 저장할 배열
   * @param depth 현재 탐색 깊이
   */
  private async scanDirectory(
    currentPath: string, 
    relativePath: string, 
    domains: DiscoveredDomain[], 
    depth: number
  ): Promise<void> {
    if (depth >= this.options.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const folderName = entry.name;
        
        // 제외 패턴 확인
        if (this.shouldExcludeFolder(folderName)) {
          continue;
        }

        const entryPath = path.join(currentPath, folderName);
        const entryRelativePath = relativePath ? path.join(relativePath, folderName) : folderName;

        // 마크다운 파일이 있는지 확인
        const documentCount = await this.countMarkdownFiles(entryPath);
        
        // 빈 폴더 처리
        if (documentCount === 0 && !this.options.includeEmpty) {
          // 하위 디렉토리 계속 탐색
          await this.scanDirectory(entryPath, entryRelativePath, domains, depth + 1);
          continue;
        }

        // 도메인으로 등록
        const domain: DiscoveredDomain = {
          name: this.generateDomainName(entryRelativePath),
          path: entryRelativePath,
          category: this.categoryMapper.mapCategory(folderName),
          isAutoDiscovered: true,
          documentCount
        };

        domains.push(domain);
        console.error(`[DEBUG] DomainDiscoveryService: Found domain '${domain.name}' at '${domain.path}' (${documentCount} documents)`);
      }
    } catch (error) {
      console.error(`[DEBUG] DomainDiscoveryService: Error scanning directory ${currentPath}:`, error);
    }
  }

  /**
   * 디렉토리 내의 마크다운 파일 개수를 세어봄
   * @param dirPath 스캔할 디렉토리 경로
   * @returns 마크다운 파일 개수
   */
  private async countMarkdownFiles(dirPath: string): Promise<number> {
    try {
      let count = 0;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && this.isMarkdownFile(entry.name)) {
          count++;
        } else if (entry.isDirectory()) {
          // 하위 디렉토리 재귀 탐색
          count += await this.countMarkdownFiles(path.join(dirPath, entry.name));
        }
      }
      
      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 파일이 마크다운 파일인지 확인
   * @param filename 파일명
   * @returns 마크다운 파일 여부
   */
  private isMarkdownFile(filename: string): boolean {
    const extensions = ['.md', '.mdx', '.markdown'];
    return extensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * 폴더를 제외해야 하는지 확인
   * @param folderName 폴더명
   * @returns 제외 여부
   */
  private shouldExcludeFolder(folderName: string): boolean {
    return this.options.excludePatterns.some(pattern => 
      folderName.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * 상대 경로로부터 도메인 이름 생성
   * @param relativePath 상대 경로
   * @returns 도메인 이름
   */
  private generateDomainName(relativePath: string): string {
    // 경로 구분자를 하이픈으로 변경하여 도메인 이름 생성
    return relativePath.replace(/[\/\\]/g, '-').toLowerCase();
  }

  /**
   * 수동 설정된 도메인과 자동 발견된 도메인을 병합
   * @param manualDomains 수동으로 설정된 도메인들
   * @param discoveredDomains 자동으로 발견된 도메인들
   * @returns 병합된 도메인 목록
   */
  mergeDomains(
    manualDomains: Array<{name: string; path: string; category?: string}>, 
    discoveredDomains: DiscoveredDomain[]
  ): DiscoveredDomain[] {
    const merged: DiscoveredDomain[] = [];
    const manualDomainPaths = new Set(manualDomains.map(d => d.path));

    // 수동 설정된 도메인들 추가
    for (const manual of manualDomains) {
      merged.push({
        name: manual.name,
        path: manual.path,
        category: manual.category || this.categoryMapper.mapCategory(manual.name),
        isAutoDiscovered: false
      });
    }

    // 자동 발견된 도메인 중 수동 설정에 없는 것들만 추가
    for (const discovered of discoveredDomains) {
      if (!manualDomainPaths.has(discovered.path)) {
        merged.push(discovered);
      }
    }

    return merged;
  }

  /**
   * 발견 옵션 업데이트
   * @param newOptions 새로운 옵션
   */
  updateOptions(newOptions: Partial<DomainDiscoveryOptions>): void {
    this.options = {
      ...this.options,
      ...newOptions
    };
    
    if (newOptions.categoryMapper) {
      this.categoryMapper = newOptions.categoryMapper;
    }
  }

  /**
   * 현재 설정된 옵션 조회
   * @returns 현재 옵션
   */
  getOptions(): Required<DomainDiscoveryOptions> {
    return { ...this.options };
  }
}
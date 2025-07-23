import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 도메인 정보 인터페이스
 */
export interface DomainInfo {
  name: string;
  displayName: string;
  description: string;
  keywords: string[];
  createdAt: Date;
  lastUpdated: Date;
  documentCount: number;
}

/**
 * 도메인 매핑 정보
 */
export interface DomainMapping {
  filePath: string;
  domainName: string;
  confidence: number;
  assignedAt: Date;
}

/**
 * 도메인 데이터 저장 구조
 */
interface DomainData {
  domains: Record<string, DomainInfo>;
  mappings: Record<string, DomainMapping>;
  lastUpdated: string;
  version: string;
}

/**
 * LLM 생성 도메인을 관리하고 지속성을 보장하는 클래스
 * 한번 생성된 도메인 이름은 고정되며, 문서-도메인 매핑을 저장
 */
export class DomainManager {
  private readonly dataPath: string;
  private domains: Map<string, DomainInfo> = new Map();
  private mappings: Map<string, DomainMapping> = new Map();
  private initialized = false;

  constructor() {
    // 도메인 데이터를 프로젝트 루트의 .domain-data.json에 저장
    this.dataPath = path.resolve(__dirname, '../../.domain-data.json');
  }

  /**
   * 도메인 매니저 초기화 - 기존 도메인 데이터 로드
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const exists = await this.fileExists(this.dataPath);
      if (exists) {
        await this.loadDomainData();
        console.error(`[DEBUG] DomainManager: Loaded ${this.domains.size} domains and ${this.mappings.size} mappings`);
      } else {
        console.error('[DEBUG] DomainManager: No existing domain data found, starting fresh');
      }
    } catch (error) {
      console.error('[DEBUG] DomainManager: Failed to load domain data, starting fresh:', error);
    }

    this.initialized = true;
  }

  /**
   * 새 도메인 생성 및 등록
   * @param domainName 도메인 이름 (소문자, 하이픈 허용)
   * @param displayName 표시용 이름
   * @param description 도메인 설명
   * @param keywords 관련 키워드들
   */
  async createDomain(
    domainName: string,
    displayName: string,
    description: string,
    keywords: string[]
  ): Promise<DomainInfo> {
    await this.ensureInitialized();

    // 도메인 이름 정규화 (소문자, 공백 제거, 하이픈으로 변환)
    const normalizedName = this.normalizeDomainName(domainName);

    if (this.domains.has(normalizedName)) {
      throw new Error(`Domain '${normalizedName}' already exists`);
    }

    const domainInfo: DomainInfo = {
      name: normalizedName,
      displayName,
      description,
      keywords: keywords.map(k => k.toLowerCase()),
      createdAt: new Date(),
      lastUpdated: new Date(),
      documentCount: 0
    };

    this.domains.set(normalizedName, domainInfo);
    await this.saveDomainData();

    console.error(`[DEBUG] DomainManager: Created new domain '${normalizedName}' - ${displayName}`);
    return domainInfo;
  }

  /**
   * 문서를 도메인에 매핑
   * @param filePath 문서 파일 경로
   * @param domainName 할당할 도메인 이름
   * @param confidence 분류 신뢰도 (0-1)
   */
  async assignDocumentToDomain(
    filePath: string,
    domainName: string,
    confidence: number
  ): Promise<void> {
    await this.ensureInitialized();

    const normalizedDomain = this.normalizeDomainName(domainName);
    const normalizedPath = path.resolve(filePath);

    // 도메인이 존재하는지 확인
    if (!this.domains.has(normalizedDomain)) {
      throw new Error(`Domain '${normalizedDomain}' does not exist`);
    }

    // 기존 매핑이 있으면 업데이트, 없으면 새로 생성
    const existingMapping = this.mappings.get(normalizedPath);
    if (existingMapping) {
      // 기존 도메인의 문서 수 감소
      const oldDomain = this.domains.get(existingMapping.domainName);
      if (oldDomain) {
        oldDomain.documentCount = Math.max(0, oldDomain.documentCount - 1);
        oldDomain.lastUpdated = new Date();
      }
    }

    const mapping: DomainMapping = {
      filePath: normalizedPath,
      domainName: normalizedDomain,
      confidence,
      assignedAt: new Date()
    };

    this.mappings.set(normalizedPath, mapping);

    // 새 도메인의 문서 수 증가
    const domain = this.domains.get(normalizedDomain)!;
    domain.documentCount += 1;
    domain.lastUpdated = new Date();

    await this.saveDomainData();

    console.error(`[DEBUG] DomainManager: Assigned '${filePath}' to domain '${normalizedDomain}' (confidence: ${confidence})`);
  }

  /**
   * 문서의 도메인 조회
   * @param filePath 문서 파일 경로
   * @returns 도메인 매핑 정보 또는 null
   */
  getDocumentDomain(filePath: string): DomainMapping | null {
    const normalizedPath = path.resolve(filePath);
    return this.mappings.get(normalizedPath) || null;
  }

  /**
   * 모든 도메인 목록 조회
   */
  getAllDomains(): DomainInfo[] {
    return Array.from(this.domains.values());
  }

  /**
   * 특정 도메인 정보 조회
   * @param domainName 도메인 이름
   */
  getDomain(domainName: string): DomainInfo | null {
    const normalizedName = this.normalizeDomainName(domainName);
    return this.domains.get(normalizedName) || null;
  }

  /**
   * 도메인의 모든 문서 매핑 조회
   * @param domainName 도메인 이름
   */
  getDomainMappings(domainName: string): DomainMapping[] {
    const normalizedName = this.normalizeDomainName(domainName);
    return Array.from(this.mappings.values())
      .filter(mapping => mapping.domainName === normalizedName);
  }

  /**
   * 문서 매핑 제거
   * @param filePath 문서 파일 경로
   */
  async removeDocumentMapping(filePath: string): Promise<boolean> {
    await this.ensureInitialized();

    const normalizedPath = path.resolve(filePath);
    const mapping = this.mappings.get(normalizedPath);

    if (!mapping) {
      return false;
    }

    // 도메인의 문서 수 감소
    const domain = this.domains.get(mapping.domainName);
    if (domain) {
      domain.documentCount = Math.max(0, domain.documentCount - 1);
      domain.lastUpdated = new Date();
    }

    this.mappings.delete(normalizedPath);
    await this.saveDomainData();

    console.error(`[DEBUG] DomainManager: Removed mapping for '${filePath}'`);
    return true;
  }

  /**
   * 도메인 존재 여부 확인
   * @param domainName 도메인 이름
   */
  hasDomain(domainName: string): boolean {
    const normalizedName = this.normalizeDomainName(domainName);
    return this.domains.has(normalizedName);
  }

  /**
   * 통계 정보 조회
   */
  getStatistics() {
    return {
      totalDomains: this.domains.size,
      totalMappings: this.mappings.size,
      domainStats: Array.from(this.domains.values()).map(domain => ({
        name: domain.name,
        displayName: domain.displayName,
        documentCount: domain.documentCount,
        createdAt: domain.createdAt,
        lastUpdated: domain.lastUpdated
      }))
    };
  }

  /**
   * 도메인 이름 정규화
   * @param name 원본 도메인 이름
   * @returns 정규화된 도메인 이름
   */
  private normalizeDomainName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 도메인 데이터 파일 로드
   */
  private async loadDomainData(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8');
      const data: DomainData = JSON.parse(content);

      // 도메인 정보 로드
      Object.entries(data.domains).forEach(([name, info]) => {
        this.domains.set(name, {
          ...info,
          createdAt: new Date(info.createdAt),
          lastUpdated: new Date(info.lastUpdated)
        });
      });

      // 매핑 정보 로드
      Object.entries(data.mappings).forEach(([path, mapping]) => {
        this.mappings.set(path, {
          ...mapping,
          assignedAt: new Date(mapping.assignedAt)
        });
      });

    } catch (error) {
      console.error('[DEBUG] DomainManager: Failed to parse domain data file:', error);
      throw error;
    }
  }

  /**
   * 도메인 데이터 파일 저장
   */
  private async saveDomainData(): Promise<void> {
    try {
      const data: DomainData = {
        domains: Object.fromEntries(this.domains.entries()),
        mappings: Object.fromEntries(this.mappings.entries()),
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };

      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(this.dataPath, content, 'utf-8');

    } catch (error) {
      console.error('[DEBUG] DomainManager: Failed to save domain data:', error);
      throw error;
    }
  }

  /**
   * 파일 존재 여부 확인
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 초기화 보장
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 대신 사용
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDomains = [
  { name: 'company', path: 'company', category: '회사정보' },
  { name: 'customer', path: 'customer', category: '고객서비스' },
  { name: 'product', path: 'product', category: '제품정보' },
  { name: 'technical', path: 'technical', category: '기술문서' },
];

/**
 * 카테고리 매핑 타입
 */
interface CategoryMapping {
  [domainName: string]: string;
}

/**
 * 기본 카테고리 매핑
 */
const defaultCategoryMapping: CategoryMapping = {
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
  terms: '이용약관'
};

/**
 * 자동으로 도메인 탐지
 * docs 폴더 구조를 스캔하여 도메인 목록 생성
 */
async function autoDiscoverDomains(basePath: string): Promise<Array<{ name: string; path: string; category: string }>> {
  try {
    // 카테고리 매핑 파일 로드 시도
    let categoryMapping: CategoryMapping = { ...defaultCategoryMapping };
    const categoryMappingPath = path.resolve(path.dirname(basePath), 'categoryMapping.json');
    
    if (fsSync.existsSync(categoryMappingPath)) {
      try {
        const mappingContent = await fs.readFile(categoryMappingPath, 'utf-8');
        const customMapping = JSON.parse(mappingContent);
        categoryMapping = { ...defaultCategoryMapping, ...customMapping };
        console.error(`[DEBUG] Loaded custom category mapping from ${categoryMappingPath}`);
      } catch (error) {
        console.error(`[DEBUG] Failed to load category mapping: ${(error as Error).message}`);
      }
    }

    // docs 폴더 스캔
    if (!fsSync.existsSync(basePath)) {
      console.error(`[DEBUG] Base path does not exist: ${basePath}`);
      return [];
    }

    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const domains: Array<{ name: string; path: string; category: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const domainName = entry.name;
        const domainPath = entry.name;
        const category = categoryMapping[domainName] || domainName; // 매핑되지 않은 경우 도메인명 사용
        
        domains.push({
          name: domainName,
          path: domainPath,
          category: category
        });
        
        console.error(`[DEBUG] Auto-discovered domain: ${domainName} -> ${category}`);
      }
    }

    console.error(`[DEBUG] Auto-discovery completed. Found ${domains.length} domains`);
    return domains;
  } catch (error) {
    console.error(`[DEBUG] Auto-discovery failed: ${(error as Error).message}`);
    return [];
  }
}

export interface Config {
  serverName: string;
  serverVersion: string;
  documentSource: DocumentSource & {
    autoDiscovery?: boolean;
  };
  bm25: {
    k1: number;
    b: number;
  };
  chunk: {
    minWords: number;
    contextWindowSize: number;
  };
  logLevel: string;
}

/**
 * 기본 설정
 */
const defaultConfig: Config = {
  serverName: process.env.MCP_SERVER_NAME || 'knowledge-retrieval',
  serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  documentSource: {
    type: (process.env.DOCS_SOURCE_TYPE as 'local' | 'remote') || 'local',
    basePath: process.env.DOCS_BASE_PATH || path.resolve(__dirname, '../../docs'),
    domains: [],
    autoDiscovery: process.env.DOCS_AUTO_DISCOVERY === 'true' || true
  },
  bm25: {
    k1: parseFloat(process.env.BM25_K1 || '1.2'),
    b: parseFloat(process.env.BM25_B || '0.75')
  },
  chunk: {
    minWords: parseInt(process.env.CHUNK_MIN_WORDS || '30'),
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || '1')
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};

/**
 * 설정 파일 로드
 * 기본적으로 config.json 파일을 찾고, 없으면 기본 설정 사용
 */
export async function loadConfig(): Promise<Config> {
  try {
    // config.json 파일 로드 시도 (절대 경로 사용)
    const configPath = path.resolve(__dirname, '../../config.json');
    // Loading config (silent for MCP protocol)
    
    const configContent = await fs.readFile(configPath, 'utf-8');
    const configJson = JSON.parse(configContent);
    
    // Config loaded successfully (silent for MCP protocol)
    
    // 자동 탐지 활성화 여부 확인
    const autoDiscoveryEnabled = configJson.documentSource?.autoDiscovery !== false;
    
    // domains가 없거나 자동 탐지가 활성화된 경우
    if (autoDiscoveryEnabled && (!configJson.documentSource || !configJson.documentSource.domains || configJson.documentSource.domains.length === 0)) {
      console.error('[DEBUG] Auto-discovery enabled and no domains configured, discovering domains automatically.');
      configJson.documentSource = configJson.documentSource || {};
      
      // basePath 결정 (임시로 기본값 사용)
      const tempBasePath = configJson.documentSource.basePath || defaultConfig.documentSource.basePath;
      const resolvedTempBasePath = path.isAbsolute(tempBasePath) ? tempBasePath : path.resolve(process.cwd(), tempBasePath);
      
      // 자동 탐지 실행
      try {
        const discoveredDomains = await autoDiscoverDomains(resolvedTempBasePath);
        if (discoveredDomains.length > 0) {
          configJson.documentSource.domains = discoveredDomains;
          console.error(`[DEBUG] Auto-discovered ${discoveredDomains.length} domains`);
        } else {
          console.error('[DEBUG] No domains discovered, using default domains.');
          configJson.documentSource.domains = defaultDomains;
        }
      } catch (error) {
        console.error('[DEBUG] Auto-discovery failed, using default domains:', (error as Error).message);
        configJson.documentSource.domains = defaultDomains;
      }
    } else if (!configJson.documentSource || !configJson.documentSource.domains || configJson.documentSource.domains.length === 0) {
      console.error('[DEBUG] `documentSource.domains` not found or empty in config.json, using default domains.');
      configJson.documentSource = configJson.documentSource || {};
      configJson.documentSource.domains = defaultDomains;
    }

    // basePath를 절대 경로로 변환 (상대 경로로 제공된 경우)
    const basePathFromConfig = configJson.documentSource && configJson.documentSource.basePath
      ? configJson.documentSource.basePath
      : defaultConfig.documentSource.basePath;

    let resolvedBasePath = path.isAbsolute(basePathFromConfig)
      ? basePathFromConfig
      : path.resolve(process.cwd(), basePathFromConfig);

    // fallback: 현재 모듈(__dirname)을 기준으로도 확인
    if (!fsSync.existsSync(resolvedBasePath)) {
      const altResolved = path.resolve(__dirname, '../../', basePathFromConfig);
      console.error(`[DEBUG] Primary basePath not found. Trying fallback relative to __dirname: ${altResolved}`);
      if (fsSync.existsSync(altResolved)) {
        resolvedBasePath = altResolved;
      }
    }

    // 디버그 로그: 경로 확인
    console.error(`[DEBUG] Config basePath resolved to: ${resolvedBasePath}`);
    console.error(`[DEBUG] Working directory: ${process.cwd()}`);
    console.error(`[DEBUG] Directory exists: ${fsSync.existsSync(resolvedBasePath)}`);
    if (fsSync.existsSync(resolvedBasePath)) {
      const stats = fsSync.statSync(resolvedBasePath);
      console.error(`[DEBUG] Directory readable: ${stats.isDirectory()}`);
    }

    return {
      ...defaultConfig,
      ...configJson,
      documentSource: {
        ...defaultConfig.documentSource,
        ...configJson.documentSource,
        basePath: resolvedBasePath,
        type: configJson.documentSource.type as 'local' | 'remote'
      },
      bm25: {
        ...defaultConfig.bm25,
        ...configJson.bm25
      },
      chunk: {
        ...defaultConfig.chunk,
        ...configJson.chunk
      }
    };
  } catch (error) {
    // config.json이 없으면 기본 설정 사용
    console.error('Failed to load config.json, using default configuration:', error);
    
    // 자동 탐지 시도
    try {
      const discoveredDomains = await autoDiscoverDomains(defaultConfig.documentSource.basePath);
      if (discoveredDomains.length > 0) {
        defaultConfig.documentSource.domains = discoveredDomains;
        console.error(`[DEBUG] Auto-discovered ${discoveredDomains.length} domains in default config`);
      } else {
        defaultConfig.documentSource.domains = defaultDomains;
      }
    } catch (autoDiscoveryError) {
      console.error('[DEBUG] Auto-discovery failed in default config, using default domains:', (autoDiscoveryError as Error).message);
      defaultConfig.documentSource.domains = defaultDomains;
    }
    
    return defaultConfig;
  }
} 
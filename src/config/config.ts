import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';
import { DomainDiscoveryService } from '../services/DomainDiscoveryService.js';

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

export interface Config {
  serverName: string;
  serverVersion: string;
  documentSource: DocumentSource & {
    autoDiscovery?: {
      enabled: boolean;
      includeEmpty?: boolean;
      maxDepth?: number;
      excludePatterns?: string[];
    };
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
    basePath: process.env.DOCS_BASE_PATH || detectDefaultBasePath(),
    domains: [],
    autoDiscovery: {
      enabled: process.env.AUTO_DISCOVERY_ENABLED !== 'false', // 기본값: true
      includeEmpty: process.env.AUTO_DISCOVERY_INCLUDE_EMPTY === 'true', // 기본값: false
      maxDepth: parseInt(process.env.AUTO_DISCOVERY_MAX_DEPTH || '2'),
      excludePatterns: process.env.AUTO_DISCOVERY_EXCLUDE_PATTERNS?.split(',') || 
        ['.git', '.vscode', 'node_modules', '.DS_Store', 'Thumbs.db']
    }
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
 * 기본 basePath 탐지 (domain/ 디렉토리만 사용)
 */
function detectDefaultBasePath(): string {
  const moduleDir = path.resolve(__dirname, '../..');
  const domainPath = path.resolve(moduleDir, 'domain');
  
  if (fsSync.existsSync(domainPath)) {
    console.error(`[DEBUG] Using domain/ directory: ${domainPath}`);
  } else {
    console.error(`[DEBUG] domain/ directory not found, will be created: ${domainPath}`);
  }
  
  return domainPath;
}

/**
 * 설정 파일 로드
 * 기본적으로 config.json 파일을 찾고, 없으면 기본 설정 사용
 * autoDiscovery가 활성화되어 있으면 자동으로 도메인을 발견
 */
export async function loadConfig(): Promise<Config> {
  let config: Config;
  
  try {
    // config.json 파일 로드 시도 (절대 경로 사용)
    const configPath = path.resolve(__dirname, '../../config.json');
    // Loading config (silent for MCP protocol)
    
    const configContent = await fs.readFile(configPath, 'utf-8');
    const configJson = JSON.parse(configContent);
    
    // Config loaded successfully (silent for MCP protocol)
    
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

    config = {
      ...defaultConfig,
      ...configJson,
      documentSource: {
        ...defaultConfig.documentSource,
        ...configJson.documentSource,
        basePath: resolvedBasePath,
        type: configJson.documentSource.type as 'local' | 'remote',
        autoDiscovery: {
          ...defaultConfig.documentSource.autoDiscovery,
          ...configJson.documentSource?.autoDiscovery
        }
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
    config = { ...defaultConfig };
  }

  // 도메인 설정 처리 (auto-discovery 포함)
  config.documentSource.domains = await resolveDomains(config);
  
  return config;
}

/**
 * 도메인 설정 해결 (auto-discovery 중심)
 */
async function resolveDomains(config: Config): Promise<Array<{name: string; path: string; category?: string}>> {
  const manualDomains = config.documentSource.domains || [];
  
  // auto-discovery가 비활성화되어 있으면 수동 도메인만 사용
  if (!config.documentSource.autoDiscovery?.enabled) {
    console.error('[DEBUG] Auto-discovery disabled, using manual domains only');
    
    if (manualDomains.length === 0) {
      console.error('[DEBUG] No manual domains configured and auto-discovery is disabled');
      console.error('[DEBUG] Please either enable auto-discovery or configure domains manually');
      return [];
    }
    
    return manualDomains;
  }

  // auto-discovery 실행
  try {
    console.error('[DEBUG] Auto-discovery enabled, scanning for domains...');
    const discoveryService = new DomainDiscoveryService({
      includeEmpty: config.documentSource.autoDiscovery.includeEmpty,
      maxDepth: config.documentSource.autoDiscovery.maxDepth,
      excludePatterns: config.documentSource.autoDiscovery.excludePatterns
    });

    const discoveredDomains = await discoveryService.discoverDomains(config.documentSource.basePath);
    const mergedDomains = discoveryService.mergeDomains(manualDomains, discoveredDomains);
    
    console.error(`[DEBUG] Domain resolution complete: ${manualDomains.length} manual + ${discoveredDomains.length} discovered = ${mergedDomains.length} total`);
    
    if (mergedDomains.length === 0) {
      console.error('[DEBUG] No domains found in domain/ directory');
      console.error('[DEBUG] Please create folders with markdown files in the domain/ directory');
      return [];
    }
    
    return mergedDomains.map(d => ({
      name: d.name,
      path: d.path,
      category: d.category
    }));
    
  } catch (error) {
    console.error('[DEBUG] Error during auto-discovery:', error);
    
    // 오류 발생 시 수동 도메인만 사용
    if (manualDomains.length > 0) {
      console.error('[DEBUG] Using manual domains as fallback');
      return manualDomains;
    }
    
    console.error('[DEBUG] No fallback domains available');
    return [];
  }
} 
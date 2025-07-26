import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';
import { DomainDiscoveryService } from '../services/DomainDiscoveryService.js';
import { logger } from '../utils/logger.js';
import { validateDirectoryPath, SecurityError } from '../utils/security.js';

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
/**
 * 간단한 경로 해결
 */
function resolveBasePath(configPath: string): string {
  // 절대 경로면 그대로 사용
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  
  // 상대 경로면 현재 작업 디렉토리 기준으로 해결
  const resolved = path.resolve(process.cwd(), configPath);
  
  // 경로 보안 검증
  try {
    const baseForValidation = path.resolve(process.cwd());
    return validateDirectoryPath(resolved, baseForValidation);
  } catch (error) {
    if (error instanceof SecurityError) {
      logger.warn(`BasePath security validation failed: ${error.message}`);
      // 보안 문제가 있으면 기본 경로 사용
      return getDefaultBasePath();
    }
    throw error;
  }
}

/**
 * 기본 설정 생성
 */
function createDefaultConfig(): Config {
  return {
    serverName: process.env.MCP_SERVER_NAME || 'knowledge-retrieval',
    serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    documentSource: {
      type: (process.env.DOCS_SOURCE_TYPE as 'local' | 'remote') || 'local',
      basePath: process.env.DOCS_BASE_PATH || getDefaultBasePath(),
      domains: [],
      autoDiscovery: {
        enabled: process.env.AUTO_DISCOVERY_ENABLED !== 'false',
        includeEmpty: process.env.AUTO_DISCOVERY_INCLUDE_EMPTY === 'true',
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
}

/**
 * 기본 basePath 결정
 */
function getDefaultBasePath(): string {
  // 현재 디렉토리에서 domain 디렉토리 찾기
  const currentDirDomain = path.resolve(process.cwd(), 'domain');
  if (fsSync.existsSync(currentDirDomain)) {
    logger.debug(`Using domain/ directory in current dir: ${currentDirDomain}`);
    return currentDirDomain;
  }
  
  // 모듈 디렉토리에서 domain 디렉토리 찾기
  const moduleDir = path.resolve(__dirname, '../..');
  const moduleDirDomain = path.resolve(moduleDir, 'domain');
  if (fsSync.existsSync(moduleDirDomain)) {
    logger.debug(`Using domain/ directory in module dir: ${moduleDirDomain}`);
    return moduleDirDomain;
  }
  
  // 어디에도 없으면 현재 디렉토리에 생성
  logger.debug(`Creating domain/ directory: ${currentDirDomain}`);
  return currentDirDomain;
}

/**
 * 설정 파일 로드
 */
export async function loadConfig(): Promise<Config> {
  const defaultConfig = createDefaultConfig();
  
  try {
    // config.json 파일 로드 시도
    const configPath = path.resolve(__dirname, '../../config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const configJson = JSON.parse(configContent);
    
    // basePath 결정 및 검증
    const configBasePath = configJson.documentSource?.basePath || defaultConfig.documentSource.basePath;
    const resolvedBasePath = resolveBasePath(configBasePath);
    
    logger.debug(`Config basePath resolved to: ${resolvedBasePath}`);

    // 설정 병합
    const config: Config = {
      ...defaultConfig,
      ...configJson,
      documentSource: {
        ...defaultConfig.documentSource,
        ...configJson.documentSource,
        basePath: resolvedBasePath,
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
    
    // 도메인 설정 처리
    config.documentSource.domains = await resolveDomains(config);
    return config;
    
  } catch (error) {
    logger.warn('Failed to load config.json, using default configuration:', error);
    const config = defaultConfig;
    config.documentSource.domains = await resolveDomains(config);
    return config;
  }
}

/**
 * 도메인 설정 해결 (auto-discovery 중심)
 */
async function resolveDomains(config: Config): Promise<Array<{name: string; path: string; category?: string}>> {
  const manualDomains = config.documentSource.domains || [];
  
  logger.debug(`=== DOMAIN RESOLUTION START ===`);
  logger.debug(`Manual domains from config: ${manualDomains.length}`);
  manualDomains.forEach(d => logger.debug(`  Manual: ${d.name} -> ${d.path}`));
  
  // auto-discovery가 비활성화되어 있으면 수동 도메인만 사용
  if (!config.documentSource.autoDiscovery?.enabled) {
    logger.debug('Auto-discovery disabled, using manual domains only');
    
    if (manualDomains.length === 0) {
      logger.debug('No manual domains configured and auto-discovery is disabled');
      logger.debug('Please either enable auto-discovery or configure domains manually');
      return [];
    }
    
    return manualDomains;
  }

  // auto-discovery 실행
  try {
    logger.debug('Auto-discovery enabled, scanning for domains...');
    const discoveryService = new DomainDiscoveryService({
      includeEmpty: config.documentSource.autoDiscovery.includeEmpty,
      maxDepth: config.documentSource.autoDiscovery.maxDepth,
      excludePatterns: config.documentSource.autoDiscovery.excludePatterns
    });

    const discoveredDomains = await discoveryService.discoverDomains(config.documentSource.basePath);
    logger.debug(`Auto-discovered domains: ${discoveredDomains.length}`);
    discoveredDomains.forEach(d => logger.debug(`  Discovered: ${d.name} -> ${d.path} (${d.documentCount} docs)`));
    
    const mergedDomains = discoveryService.mergeDomains(manualDomains, discoveredDomains);
    logger.debug(`Merged domains: ${mergedDomains.length}`);
    mergedDomains.forEach(d => logger.debug(`  Final: ${d.name} -> ${d.path} (manual: ${!d.isAutoDiscovered})`));
    
    logger.debug(`Domain resolution complete: ${manualDomains.length} manual + ${discoveredDomains.length} discovered = ${mergedDomains.length} total`);
    
    if (mergedDomains.length === 0) {
      logger.debug('No domains found in domain/ directory');
      logger.debug('Please create folders with markdown files in the domain/ directory');
      return [];
    }
    
    const result = mergedDomains.map(d => ({
      name: d.name,
      path: d.path,
      category: d.category
    }));
    
    logger.debug(`=== DOMAIN RESOLUTION RESULT ===`);
    result.forEach(d => logger.debug(`  Result: ${d.name} -> ${d.path} (${d.category})`));
    logger.debug(`=== DOMAIN RESOLUTION END ===`);
    
    return result;
    
  } catch (error) {
    logger.error('Error during auto-discovery:', error);
    
    // 오류 발생 시 수동 도메인만 사용
    if (manualDomains.length > 0) {
      logger.debug('Using manual domains as fallback');
      return manualDomains;
    }
    
    logger.debug('No fallback domains available');
    return [];
  }
} 
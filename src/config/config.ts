import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';
import { CategoryMappingService } from '../services/CategoryMappingService.js';
import { DomainDiscoveryService } from '../services/DomainDiscoveryService.js';
import { ConfigError, ConfigFileError, ConfigValidationError } from './ConfigError.js';

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 대신 사용
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 서비스 인스턴스 생성
const categoryMappingService = new CategoryMappingService();
const domainDiscoveryService = new DomainDiscoveryService(categoryMappingService);

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
    const configPath = path.resolve(__dirname, '../../config.json');
    const configJson = await loadConfigFile(configPath);
    
    // 도메인 설정 처리
    const processedConfig = await processDomainsConfiguration(configJson);
    
    // 경로 처리
    const finalConfig = await processBasePath(processedConfig);
    
    return finalConfig;
  } catch (error) {
    console.error('Failed to load config.json, using default configuration:', error);
    return await loadDefaultConfig();
  }
}

/**
 * 설정 파일 로드 및 파싱
 */
async function loadConfigFile(configPath: string): Promise<any> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const configJson = JSON.parse(configContent);
    
    // 기본 검증
    validateConfigStructure(configJson);
    
    return configJson;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigFileError(configPath, new Error('JSON 파싱 오류'));
    }
    throw new ConfigFileError(configPath, error as Error);
  }
}

/**
 * 도메인 설정 처리
 */
async function processDomainsConfiguration(configJson: any): Promise<any> {
  const autoDiscoveryEnabled = configJson.documentSource?.autoDiscovery !== false;
  const hasDomains = configJson.documentSource?.domains?.length > 0;
  
  if (autoDiscoveryEnabled && !hasDomains) {
    console.error('[DEBUG] Auto-discovery enabled and no domains configured, discovering domains automatically.');
    
    configJson.documentSource = configJson.documentSource || {};
    
    // basePath 결정
    const tempBasePath = configJson.documentSource.basePath || defaultConfig.documentSource.basePath;
    const resolvedTempBasePath = path.isAbsolute(tempBasePath) ? tempBasePath : path.resolve(process.cwd(), tempBasePath);
    
    // 자동 탐지 실행
    try {
      const discoveredDomains = await domainDiscoveryService.discoverDomains(resolvedTempBasePath);
      
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
  } else if (!hasDomains) {
    console.error('[DEBUG] `documentSource.domains` not found or empty in config.json, using default domains.');
    configJson.documentSource = configJson.documentSource || {};
    configJson.documentSource.domains = defaultDomains;
  }
  
  return configJson;
}

/**
 * 기본 경로 처리
 */
async function processBasePath(configJson: any): Promise<Config> {
  const basePathFromConfig = configJson.documentSource?.basePath || defaultConfig.documentSource.basePath;
  
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
}

/**
 * 기본 설정 로드
 */
async function loadDefaultConfig(): Promise<Config> {
  try {
    const discoveredDomains = await domainDiscoveryService.discoverDomains(defaultConfig.documentSource.basePath);
    
    if (discoveredDomains.length > 0) {
      defaultConfig.documentSource.domains = discoveredDomains;
      console.error(`[DEBUG] Auto-discovered ${discoveredDomains.length} domains in default config`);
    } else {
      defaultConfig.documentSource.domains = defaultDomains;
    }
  } catch (error) {
    console.error('[DEBUG] Auto-discovery failed in default config, using default domains:', (error as Error).message);
    defaultConfig.documentSource.domains = defaultDomains;
  }
  
  return defaultConfig;
}

/**
 * 설정 구조 검증
 */
function validateConfigStructure(config: any): void {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('config', config, 'object');
  }
  
  // 필수 필드 검증은 병합 과정에서 defaultConfig로 처리됨
} 
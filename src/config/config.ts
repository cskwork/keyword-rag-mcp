import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';
// Removed unused ConfigError imports

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 대신 사용
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * 스마트 기본값으로 설정 생성
 */
const createDefaultConfig = (): Config => ({
  serverName: process.env.MCP_SERVER_NAME || 'knowledge-retrieval',
  serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  documentSource: {
    type: (process.env.DOCS_SOURCE_TYPE as 'local' | 'remote') || 'local',
    basePath: process.env.DOCS_BASE_PATH || path.resolve(__dirname, '../../docs'),
    domains: [],
    autoDiscovery: true
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
});

/**
 * 폴더 구조에서 도메인 자동 발견
 */
async function discoverDomains(basePath: string): Promise<any[]> {
  try {
    if (!fsSync.existsSync(basePath)) {
      return [];
    }

    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const domains = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // 기본 카테고리 매핑 (간단한 한국어 이름)
        const categoryMap: { [key: string]: string } = {
          company: '회사정보',
          customer: '고객서비스', 
          product: '제품정보',
          technical: '기술문서',
          docs: '문서',
          guides: '가이드',
          api: 'API문서'
        };

        domains.push({
          name: entry.name,
          path: entry.name,
          category: categoryMap[entry.name.toLowerCase()] || '일반문서'
        });
      }
    }

    return domains;
  } catch (error) {
    console.error(`[DEBUG] Domain discovery failed: ${(error as Error).message}`);
    return [];
  }
}

/**
 * 설정 파일 로드 또는 자동 생성
 */
export async function loadConfig(): Promise<Config> {
  const configPath = path.resolve(__dirname, '../../config.json');
  
  try {
    // config.json이 있으면 로드
    if (fsSync.existsSync(configPath)) {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const configJson = JSON.parse(configContent);
      const config = mergeWithDefaults(configJson);
      return await processConfig(config);
    }
  } catch (error) {
    console.error(`[WARNING] Failed to load config.json: ${(error as Error).message}`);
  }

  // config.json이 없으면 기본 설정 사용하고 자동 생성
  console.error('[INFO] No config.json found, using auto-discovery');
  const defaultConfig = createDefaultConfig();
  const processedConfig = await processConfig(defaultConfig);
  
  // 설정 파일 자동 생성
  await createConfigFile(configPath, processedConfig);
  
  return processedConfig;
}

/**
 * 설정 처리 (경로 해석 및 도메인 발견)
 */
async function processConfig(config: Config): Promise<Config> {
  // basePath 처리
  let resolvedBasePath = path.isAbsolute(config.documentSource.basePath)
    ? config.documentSource.basePath
    : path.resolve(process.cwd(), config.documentSource.basePath);

  // fallback: __dirname 기준으로도 확인
  if (!fsSync.existsSync(resolvedBasePath)) {
    const altResolved = path.resolve(__dirname, '../../', config.documentSource.basePath);
    if (fsSync.existsSync(altResolved)) {
      resolvedBasePath = altResolved;
    }
  }

  // 도메인 자동 발견
  if (config.documentSource.autoDiscovery && config.documentSource.domains.length === 0) {
    const discoveredDomains = await discoverDomains(resolvedBasePath);
    config.documentSource.domains = discoveredDomains.length > 0 
      ? discoveredDomains 
      : [{ name: 'docs', path: 'docs', category: '문서' }]; // 기본 도메인
  }

  return {
    ...config,
    documentSource: {
      ...config.documentSource,
      basePath: resolvedBasePath
    }
  };
}

/**
 * 기본값과 사용자 설정 병합
 */
function mergeWithDefaults(userConfig: any): Config {
  const defaults = createDefaultConfig();
  
  return {
    serverName: userConfig.serverName || defaults.serverName,
    serverVersion: userConfig.serverVersion || defaults.serverVersion,
    documentSource: {
      type: userConfig.documentSource?.type || defaults.documentSource.type,
      basePath: userConfig.documentSource?.basePath || defaults.documentSource.basePath,
      domains: userConfig.documentSource?.domains || [],
      autoDiscovery: userConfig.documentSource?.autoDiscovery ?? defaults.documentSource.autoDiscovery
    },
    bm25: {
      k1: userConfig.bm25?.k1 || defaults.bm25.k1,
      b: userConfig.bm25?.b || defaults.bm25.b
    },
    chunk: {
      minWords: userConfig.chunk?.minWords || defaults.chunk.minWords,
      contextWindowSize: userConfig.chunk?.contextWindowSize || defaults.chunk.contextWindowSize
    },
    logLevel: userConfig.logLevel || defaults.logLevel
  };
}

/**
 * 설정 파일 자동 생성
 */
async function createConfigFile(configPath: string, config: Config): Promise<void> {
  try {
    const configForFile = {
      serverName: config.serverName,
      documentSource: {
        type: config.documentSource.type,
        basePath: "./docs", // 상대 경로로 저장
        autoDiscovery: true,
        domains: config.documentSource.domains
      },
      bm25: config.bm25,
      chunk: config.chunk,
      logLevel: config.logLevel
    };

    await fs.writeFile(configPath, JSON.stringify(configForFile, null, 2));
    console.error(`[INFO] Created config.json with auto-discovered settings`);
  } catch (error) {
    console.error(`[WARNING] Failed to create config.json: ${(error as Error).message}`);
  }
}
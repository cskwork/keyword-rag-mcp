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

export interface Config {
  serverName: string;
  serverVersion: string;
  documentSource: DocumentSource;
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
    domains: []
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
    
    // domains가 없으면 기본값으로 채움
    if (!configJson.documentSource || !configJson.documentSource.domains || configJson.documentSource.domains.length === 0) {
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
    
    // 기본 도메인 설정
    defaultConfig.documentSource.domains = defaultDomains;
    
    return defaultConfig;
  }
} 
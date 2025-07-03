import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import type { DocumentSource } from '../services/DocumentLoader.js';

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 대신 사용
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    
    // basePath를 절대 경로로 변환 (상대 경로로 제공된 경우)
    let resolvedBasePath = defaultConfig.documentSource.basePath;
    if (configJson.documentSource && configJson.documentSource.basePath) {
      resolvedBasePath = path.isAbsolute(configJson.documentSource.basePath)
        ? configJson.documentSource.basePath
        : path.resolve(process.cwd(), configJson.documentSource.basePath);
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
    defaultConfig.documentSource.domains = [
      {
        name: 'general',
        path: 'general',
        category: '일반'
      },
      {
        name: 'company',
        path: 'company',
        category: '회사정보'
      },
      {
        name: 'customer',
        path: 'customer',
        category: '고객서비스'
      }
    ];
    
    return defaultConfig;
  }
} 
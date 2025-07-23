import dotenv from 'dotenv';
import path from 'path';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 대신 사용
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 간소화된 설정 인터페이스
 * 도메인은 동적으로 생성/관리되므로 설정에서 제외
 */
export interface Config {
  serverName: string;
  serverVersion: string;
  documentSource: {
    type: 'local' | 'remote';
    basePath: string;
  };
  bm25: {
    k1: number;
    b: number;
  };
  chunk: {
    minWords: number;
    contextWindowSize: number;
  };
  classification: {
    enabled: boolean;
    autoClassifyNewDocuments: boolean;
  };
  logLevel: string;
}

/**
 * .env 파일에서 설정 로드
 * config.json은 더 이상 사용하지 않음
 */
export function loadConfig(): Config {
  // 문서 기본 경로 설정 및 검증
  const defaultBasePath = path.resolve(__dirname, '../../docs');
  let basePath = process.env.DOCS_BASE_PATH || defaultBasePath;

  // 상대 경로를 절대 경로로 변환
  if (!path.isAbsolute(basePath)) {
    basePath = path.resolve(process.cwd(), basePath);
  }

  // fallback: 현재 모듈을 기준으로 상대 경로 해석
  if (!fsSync.existsSync(basePath)) {
    const altBasePath = path.resolve(__dirname, '../../', process.env.DOCS_BASE_PATH || 'docs');
    if (fsSync.existsSync(altBasePath)) {
      basePath = altBasePath;
    }
  }


  const config: Config = {
    serverName: process.env.MCP_SERVER_NAME || 'knowledge-retrieval',
    serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    documentSource: {
      type: (process.env.DOCS_SOURCE_TYPE as 'local' | 'remote') || 'local',
      basePath
    },
    bm25: {
      k1: parseFloat(process.env.BM25_K1 || '1.2'),
      b: parseFloat(process.env.BM25_B || '0.75')
    },
    chunk: {
      minWords: parseInt(process.env.CHUNK_MIN_WORDS || '30'),
      contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || '1')
    },
    classification: {
      enabled: process.env.CLASSIFICATION_ENABLED !== 'false', // 기본 활성화
      autoClassifyNewDocuments: process.env.AUTO_CLASSIFY_NEW_DOCS !== 'false' // 기본 활성화
    },
    logLevel: process.env.LOG_LEVEL || 'info'
  };


  return config;
} 
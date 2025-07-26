/**
 * 입력 검증 유틸리티
 * MCP 도구 매개변수의 안전성과 유효성을 검증
 */

import { logger } from './logger.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 키워드 배열 검증
 */
export function validateKeywords(keywords: any): string[] {
  if (!Array.isArray(keywords)) {
    throw new ValidationError('Keywords must be an array');
  }

  if (keywords.length === 0) {
    throw new ValidationError('Keywords array cannot be empty');
  }

  if (keywords.length > 50) {
    throw new ValidationError('Too many keywords (maximum: 50)');
  }

  const validatedKeywords: string[] = [];
  
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    
    if (typeof keyword !== 'string') {
      throw new ValidationError(`Keyword at index ${i} must be a string`);
    }

    const trimmed = keyword.trim();
    
    if (trimmed.length === 0) {
      continue; // 빈 키워드는 무시
    }

    if (trimmed.length > 100) {
      throw new ValidationError(`Keyword at index ${i} is too long (maximum: 100 characters)`);
    }

    // 위험한 패턴 검사
    if (containsUnsafePatterns(trimmed)) {
      throw new ValidationError(`Keyword at index ${i} contains unsafe patterns`);
    }

    validatedKeywords.push(trimmed);
  }

  if (validatedKeywords.length === 0) {
    throw new ValidationError('No valid keywords provided');
  }

  return validatedKeywords;
}

/**
 * 도메인 이름 검증
 */
export function validateDomain(domain: any): string | undefined {
  if (domain === undefined || domain === null) {
    return undefined;
  }

  if (typeof domain !== 'string') {
    throw new ValidationError('Domain must be a string');
  }

  const trimmed = domain.trim();
  
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > 50) {
    throw new ValidationError('Domain name is too long (maximum: 50 characters)');
  }

  // 안전한 도메인 이름 패턴 (영문자, 숫자, 하이픈, 언더스코어만 허용)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new ValidationError('Domain name contains invalid characters (only a-z, A-Z, 0-9, _, - allowed)');
  }

  return trimmed;
}

/**
 * 숫자 검증 (ID, topN 등)
 */
export function validateNumber(value: any, fieldName: string, options: {
  min?: number;
  max?: number;
  integer?: boolean;
} = {}): number {
  if (typeof value !== 'number') {
    throw new ValidationError(`${fieldName} must be a number`);
  }

  if (isNaN(value) || !isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`${fieldName} must be at least ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`${fieldName} must be at most ${options.max}`);
  }

  return value;
}

/**
 * 문서 ID 검증
 */
export function validateDocumentId(id: any): number {
  return validateNumber(id, 'Document ID', {
    min: 0,
    integer: true
  });
}

/**
 * 청크 ID 검증
 */
export function validateChunkId(id: any): number {
  return validateNumber(id, 'Chunk ID', {
    min: 0,
    integer: true
  });
}

/**
 * topN 매개변수 검증
 */
export function validateTopN(topN: any): number {
  if (topN === undefined || topN === null) {
    return 10; // 기본값
  }

  return validateNumber(topN, 'topN', {
    min: 1,
    max: 100,
    integer: true
  });
}

/**
 * 윈도우 크기 검증
 */
export function validateWindowSize(windowSize: any): number {
  if (windowSize === undefined || windowSize === null) {
    return 1; // 기본값
  }

  return validateNumber(windowSize, 'windowSize', {
    min: 0,
    max: 10,
    integer: true
  });
}

/**
 * 위험한 패턴 검사
 */
function containsUnsafePatterns(text: string): boolean {
  const unsafePatterns = [
    // 경로 순회 시도
    /\.\.\//,
    /\.\.\\/,
    
    // 스크립트 태그
    /<script/i,
    /<\/script>/i,
    
    // SQL 인젝션 패턴
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i,
    
    // 명령 실행 시도
    /\||\&\&|\;/,
    
    // 매우 긴 정규식 패턴 (ReDoS 공격 방지)
    /(\(.*\)|\[.*\]|\{.*\}){10,}/
  ];

  return unsafePatterns.some(pattern => pattern.test(text));
}

/**
 * 도구별 매개변수 검증 함수들
 */
export const toolValidators = {
  'search-documents': (args: any) => {
    return {
      keywords: validateKeywords(args.keywords),
      domain: validateDomain(args.domain),
      topN: validateTopN(args.topN)
    };
  },

  'get-document-by-id': (args: any) => {
    return {
      id: validateDocumentId(args.id)
    };
  },

  'list-domains': (args: any) => {
    // list-domains는 매개변수가 없음
    return {};
  },

  'get-chunk-with-context': (args: any) => {
    return {
      documentId: validateDocumentId(args.documentId),
      chunkId: validateChunkId(args.chunkId),
      windowSize: validateWindowSize(args.windowSize)
    };
  }
};

/**
 * 일반적인 도구 매개변수 검증
 */
export function validateToolArguments(toolName: string, args: any): any {
  const validator = toolValidators[toolName as keyof typeof toolValidators];
  
  if (!validator) {
    throw new ValidationError(`Unknown tool: ${toolName}`);
  }

  try {
    return validator(args);
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn(`Validation failed for tool ${toolName}:`, error.message);
      throw error;
    }
    
    logger.error(`Unexpected validation error for tool ${toolName}:`, error);
    throw new ValidationError('Validation failed due to unexpected error');
  }
}
/**
 * 설정 관련 에러 타입
 */
export class ConfigError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ConfigError';
    
    // 에러 스택 트레이스 개선
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * 설정 파일 로드 에러
 */
export class ConfigFileError extends ConfigError {
  constructor(filePath: string, cause?: Error) {
    super(`설정 파일 로드 실패: ${filePath}`, cause);
    this.name = 'ConfigFileError';
  }
}

/**
 * 설정 검증 에러
 */
export class ConfigValidationError extends ConfigError {
  constructor(field: string, value: any, expectedType?: string) {
    const message = expectedType 
      ? `설정 검증 실패: ${field} (기대값: ${expectedType}, 실제값: ${typeof value})`
      : `설정 검증 실패: ${field} (값: ${value})`;
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 도메인 탐지 에러
 */
export class DomainDiscoveryError extends ConfigError {
  constructor(basePath: string, cause?: Error) {
    super(`도메인 탐지 실패: ${basePath}`, cause);
    this.name = 'DomainDiscoveryError';
  }
}

/**
 * 카테고리 매핑 에러
 */
export class CategoryMappingError extends ConfigError {
  constructor(mappingPath: string, cause?: Error) {
    super(`카테고리 매핑 로드 실패: ${mappingPath}`, cause);
    this.name = 'CategoryMappingError';
  }
}
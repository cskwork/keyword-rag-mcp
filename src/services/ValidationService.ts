import * as fsSync from 'fs';
import path from 'path';
import { Config } from '../config/config.js';
import { ConfigValidationError } from '../config/ConfigError.js';

/**
 * 검증 결과 타입
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 헬스체크 결과 타입
 */
export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'unhealthy';
  timestamp: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'warn' | 'fail';
      message: string;
      details?: any;
    };
  };
}

/**
 * 설정 검증 및 헬스체크 서비스
 */
export class ValidationService {
  /**
   * 설정 파일 검증
   * @param config 검증할 설정 객체
   * @returns 검증 결과
   */
  validateConfig(config: Config): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 기본 필드 검증
    if (!config.serverName || typeof config.serverName !== 'string') {
      errors.push('serverName은 비어있지 않은 문자열이어야 합니다.');
    }

    if (!config.serverVersion || typeof config.serverVersion !== 'string') {
      errors.push('serverVersion은 비어있지 않은 문자열이어야 합니다.');
    }

    // documentSource 검증
    if (!config.documentSource) {
      errors.push('documentSource 설정이 필요합니다.');
    } else {
      this.validateDocumentSource(config.documentSource, errors, warnings);
    }

    // BM25 파라미터 검증
    if (!config.bm25) {
      errors.push('bm25 설정이 필요합니다.');
    } else {
      this.validateBM25Config(config.bm25, errors, warnings);
    }

    // 청크 설정 검증
    if (!config.chunk) {
      errors.push('chunk 설정이 필요합니다.');
    } else {
      this.validateChunkConfig(config.chunk, errors, warnings);
    }

    // 로그 레벨 검증
    this.validateLogLevel(config.logLevel, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 문서 소스 설정 검증
   */
  private validateDocumentSource(
    documentSource: any,
    errors: string[],
    warnings: string[]
  ): void {
    if (!documentSource.type || !['local', 'remote'].includes(documentSource.type)) {
      errors.push('documentSource.type은 "local" 또는 "remote"여야 합니다.');
    }

    if (!documentSource.basePath || typeof documentSource.basePath !== 'string') {
      errors.push('documentSource.basePath는 비어있지 않은 문자열이어야 합니다.');
    } else {
      // 경로 존재 여부 확인 (로컬 타입인 경우)
      if (documentSource.type === 'local') {
        if (!path.isAbsolute(documentSource.basePath)) {
          warnings.push('documentSource.basePath는 절대 경로를 사용하는 것이 권장됩니다.');
        }
        
        if (!fsSync.existsSync(documentSource.basePath)) {
          errors.push(`documentSource.basePath 경로가 존재하지 않습니다: ${documentSource.basePath}`);
        } else {
          const stats = fsSync.statSync(documentSource.basePath);
          if (!stats.isDirectory()) {
            errors.push(`documentSource.basePath는 디렉토리여야 합니다: ${documentSource.basePath}`);
          }
        }
      }
    }

    // 도메인 설정 검증
    if (!Array.isArray(documentSource.domains)) {
      if (documentSource.autoDiscovery !== true) {
        errors.push('documentSource.domains는 배열이어야 하거나 autoDiscovery가 활성화되어야 합니다.');
      }
    } else {
      this.validateDomains(documentSource.domains, errors, warnings);
    }

    // 자동 탐지 설정 검증
    if (documentSource.autoDiscovery !== undefined && typeof documentSource.autoDiscovery !== 'boolean') {
      warnings.push('documentSource.autoDiscovery는 boolean 값이어야 합니다.');
    }
  }

  /**
   * 도메인 설정 검증
   */
  private validateDomains(domains: any[], errors: string[], warnings: string[]): void {
    if (domains.length === 0) {
      warnings.push('도메인이 설정되지 않았습니다. autoDiscovery를 활성화하거나 도메인을 추가하세요.');
    }

    domains.forEach((domain, index) => {
      if (!domain.name || typeof domain.name !== 'string') {
        errors.push(`domains[${index}].name은 비어있지 않은 문자열이어야 합니다.`);
      }

      if (!domain.path || typeof domain.path !== 'string') {
        errors.push(`domains[${index}].path는 비어있지 않은 문자열이어야 합니다.`);
      }

      if (domain.category && typeof domain.category !== 'string') {
        warnings.push(`domains[${index}].category는 문자열이어야 합니다.`);
      }

      // 도메인명 패턴 검증
      if (domain.name && !/^[a-zA-Z0-9_-]+$/.test(domain.name)) {
        warnings.push(`domains[${index}].name은 영숫자, 하이픈, 언더스코어만 포함해야 합니다: ${domain.name}`);
      }
    });

    // 중복 도메인명 검증
    const domainNames = domains.map(d => d.name).filter(Boolean);
    const duplicates = domainNames.filter((name, index) => domainNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`중복된 도메인명이 있습니다: ${duplicates.join(', ')}`);
    }
  }

  /**
   * BM25 설정 검증
   */
  private validateBM25Config(bm25: any, errors: string[], warnings: string[]): void {
    if (typeof bm25.k1 !== 'number' || bm25.k1 <= 0) {
      errors.push('bm25.k1은 양수여야 합니다.');
    } else if (bm25.k1 < 0.5 || bm25.k1 > 3.0) {
      warnings.push('bm25.k1은 일반적으로 0.5-3.0 범위에서 설정됩니다.');
    }

    if (typeof bm25.b !== 'number' || bm25.b < 0 || bm25.b > 1) {
      errors.push('bm25.b는 0과 1 사이의 숫자여야 합니다.');
    }
  }

  /**
   * 청크 설정 검증
   */
  private validateChunkConfig(chunk: any, errors: string[], warnings: string[]): void {
    if (typeof chunk.minWords !== 'number' || chunk.minWords <= 0) {
      errors.push('chunk.minWords는 양의 정수여야 합니다.');
    } else if (chunk.minWords < 10) {
      warnings.push('chunk.minWords가 너무 작습니다. 최소 10 이상을 권장합니다.');
    } else if (chunk.minWords > 500) {
      warnings.push('chunk.minWords가 너무 큽니다. 500 이하를 권장합니다.');
    }

    if (typeof chunk.contextWindowSize !== 'number' || chunk.contextWindowSize < 0) {
      errors.push('chunk.contextWindowSize는 0 이상의 정수여야 합니다.');
    } else if (chunk.contextWindowSize > 5) {
      warnings.push('chunk.contextWindowSize가 너무 큽니다. 5 이하를 권장합니다.');
    }
  }

  /**
   * 로그 레벨 검증
   */
  private validateLogLevel(logLevel: any, warnings: string[]): void {
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (logLevel && !validLevels.includes(logLevel)) {
      warnings.push(`logLevel은 다음 중 하나여야 합니다: ${validLevels.join(', ')}`);
    }
  }

  /**
   * 시스템 헬스체크 수행
   * @param config 현재 설정
   * @param repository 문서 저장소 (선택사항)
   * @returns 헬스체크 결과
   */
  async performHealthCheck(config?: Config, repository?: any): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // 설정 검증
    if (config) {
      const validation = this.validateConfig(config);
      checks.configuration = {
        status: validation.isValid ? 'pass' : 'fail',
        message: validation.isValid 
          ? '설정이 유효합니다.' 
          : `설정 오류: ${validation.errors.length}개`,
        details: { errors: validation.errors, warnings: validation.warnings }
      };
    }

    // 파일 시스템 접근 확인
    if (config?.documentSource?.basePath) {
      try {
        const basePath = config.documentSource.basePath;
        if (fsSync.existsSync(basePath)) {
          const stats = fsSync.statSync(basePath);
          if (stats.isDirectory()) {
            // 읽기 권한 확인
            fsSync.accessSync(basePath, fsSync.constants.R_OK);
            checks.filesystem = {
              status: 'pass',
              message: '파일 시스템 접근 가능',
              details: { path: basePath }
            };
          } else {
            checks.filesystem = {
              status: 'fail',
              message: '경로가 디렉토리가 아닙니다.',
              details: { path: basePath }
            };
          }
        } else {
          checks.filesystem = {
            status: 'fail',
            message: '문서 경로가 존재하지 않습니다.',
            details: { path: basePath }
          };
        }
      } catch (error) {
        checks.filesystem = {
          status: 'fail',
          message: '파일 시스템 접근 실패',
          details: { error: (error as Error).message }
        };
      }
    }

    // 메모리 사용량 확인
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    checks.memory = {
      status: memUsageMB.heapUsed > 500 ? 'warn' : 'pass',
      message: `힙 메모리 사용량: ${memUsageMB.heapUsed}MB`,
      details: memUsageMB
    };

    // 저장소 상태 확인
    if (repository) {
      try {
        const isInitialized = repository.isInitialized();
        const stats = isInitialized ? repository.getStatistics() : null;
        
        checks.repository = {
          status: isInitialized ? 'pass' : 'fail',
          message: isInitialized 
            ? `저장소 정상 (문서 ${stats?.totalDocuments || 0}개)` 
            : '저장소가 초기화되지 않음',
          details: stats
        };
      } catch (error) {
        checks.repository = {
          status: 'fail',
          message: '저장소 상태 확인 실패',
          details: { error: (error as Error).message }
        };
      }
    }

    // 전체 상태 결정
    const hasFailures = Object.values(checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn');
    
    const status: HealthCheckResult['status'] = hasFailures 
      ? 'unhealthy' 
      : hasWarnings 
        ? 'warning' 
        : 'healthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks
    };
  }
}
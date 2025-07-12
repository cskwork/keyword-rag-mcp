import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ValidationService } from '../../services/ValidationService.js';
import * as fsSync from 'fs';

// fs 모듈 모킹
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
  accessSync: jest.fn(),
  constants: {
    R_OK: 4
  }
}));

const mockFsSync = fsSync as jest.Mocked<typeof fsSync>;

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = new ValidationService();
    jest.clearAllMocks();
    
    // 기본 모킹 설정
    mockFsSync.existsSync.mockReturnValue(true);
    mockFsSync.statSync.mockReturnValue({ isDirectory: () => true });
    mockFsSync.accessSync.mockReturnValue(undefined);
  });

  describe('validateConfig', () => {
    test('should validate valid config', () => {
      const config = {
        serverName: 'test-server',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'remote' as const,  // Use remote type to avoid filesystem checks
          basePath: 'https://example.com/docs',
          domains: [
            { name: 'company', path: 'company' }
          ]
        },
        bm25: {
          k1: 1.2,
          b: 0.75
        },
        chunk: {
          minWords: 30,
          contextWindowSize: 1
        }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject missing required fields', () => {
      const config = {} as any;

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('serverName은 비어있지 않은 문자열이어야 합니다.');
      expect(result.errors).toContain('serverVersion은 비어있지 않은 문자열이어야 합니다.');
      expect(result.errors).toContain('documentSource 설정이 필요합니다.');
    });

    test('should validate documentSource type', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'invalid' as any,
          basePath: '/docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('documentSource.type은 "local" 또는 "remote"여야 합니다.');
    });

    test('should check basePath existence for local type', () => {
      mockFsSync.existsSync.mockReturnValue(false);
      
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/nonexistent',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('documentSource.basePath 경로가 존재하지 않습니다: /nonexistent');
    });

    test('should validate BM25 parameters', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: []
        },
        bm25: {
          k1: -1,
          b: 1.5
        },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('bm25.k1은 양수여야 합니다.');
      expect(result.errors).toContain('bm25.b는 0과 1 사이의 숫자여야 합니다.');
    });

    test('should provide warnings for suboptimal BM25 parameters', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'remote' as const,
          basePath: 'https://example.com/docs',
          domains: []
        },
        bm25: {
          k1: 0.4,
          b: 0.75
        },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('bm25.k1은 일반적으로 0.5-3.0 범위에서 설정됩니다.');
    });

    test('should validate chunk settings', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: {
          minWords: -5,
          contextWindowSize: -1
        }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('chunk.minWords는 양의 정수여야 합니다.');
      expect(result.errors).toContain('chunk.contextWindowSize는 0 이상의 정수여야 합니다.');
    });

    test('should provide warnings for chunk settings', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'remote' as const,
          basePath: 'https://example.com/docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: {
          minWords: 5,
          contextWindowSize: 10
        }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('chunk.minWords가 너무 작습니다. 최소 10 이상을 권장합니다.');
      expect(result.warnings).toContain('chunk.contextWindowSize가 너무 큽니다. 5 이하를 권장합니다.');
    });

    test('should validate domain names', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: [
            { name: 'valid-domain', path: 'valid' },
            { name: 'invalid domain', path: 'invalid' }
          ]
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.warnings).toContain('domains[1].name은 영숫자, 하이픈, 언더스코어만 포함해야 합니다: invalid domain');
    });

    test('should detect duplicate domain names', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: [
            { name: 'company', path: 'company1' },
            { name: 'company', path: 'company2' }
          ]
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('중복된 도메인명이 있습니다: company');
    });

    test('should warn about relative basePath', () => {
      const config = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: './docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = service.validateConfig(config);
      
      expect(result.warnings).toContain('documentSource.basePath는 절대 경로를 사용하는 것이 권장됩니다.');
    });
  });

  describe('performHealthCheck', () => {
    test('should return healthy status when all checks pass', async () => {
      // 파일 시스템 모킹 설정
      mockFsSync.existsSync.mockReturnValue(true);
      mockFsSync.statSync.mockReturnValue({
        isDirectory: () => true
      });
      mockFsSync.accessSync.mockImplementation(() => {}); // 접근 권한 OK

      const mockConfig = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const mockRepository = {
        isInitialized: () => true,
        getStatistics: () => ({
          totalDocuments: 10,
          totalChunks: 50
        })
      };

      const result = await service.performHealthCheck(mockConfig, mockRepository);
      
      expect(result.status).toBe('healthy');
      expect(result.checks.configuration?.status).toBe('pass');
      expect(result.checks.filesystem?.status).toBe('pass');
      expect(result.checks.memory?.status).toBeTruthy();
      expect(result.checks.repository?.status).toBe('pass');
    });

    test('should return unhealthy status for invalid config', async () => {
      const mockConfig = {
        serverName: '',
        serverVersion: '',
        documentSource: null as any,
        bm25: null as any,
        chunk: null as any
      };

      const result = await service.performHealthCheck(mockConfig);
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.configuration?.status).toBe('fail');
    });

    test('should handle filesystem access errors', async () => {
      mockFsSync.existsSync.mockReturnValue(false);

      const mockConfig = {
        serverName: 'test',
        serverVersion: '1.0.0',
        documentSource: {
          type: 'local' as const,
          basePath: '/docs',
          domains: []
        },
        bm25: { k1: 1.2, b: 0.75 },
        chunk: { minWords: 30, contextWindowSize: 1 }
      };

      const result = await service.performHealthCheck(mockConfig);
      
      expect(result.checks.filesystem?.status).toBe('fail');
      expect(result.checks.filesystem?.message).toContain('문서 경로가 존재하지 않습니다');
    });

    test('should check repository initialization', async () => {
      const mockRepository = {
        isInitialized: () => false
      };

      const result = await service.performHealthCheck(undefined, mockRepository);
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.repository?.status).toBe('fail');
      expect(result.checks.repository?.message).toContain('저장소가 초기화되지 않음');
    });

    test('should handle repository errors', async () => {
      const mockRepository = {
        isInitialized: () => {
          throw new Error('Repository error');
        }
      };

      const result = await service.performHealthCheck(undefined, mockRepository);
      
      expect(result.checks.repository?.status).toBe('fail');
      expect(result.checks.repository?.message).toContain('저장소 상태 확인 실패');
    });

    test('should check memory usage', async () => {
      const result = await service.performHealthCheck();
      
      expect(result.checks.memory).toBeDefined();
      expect(['pass', 'warn']).toContain(result.checks.memory?.status);
      expect(result.checks.memory?.message).toContain('힙 메모리 사용량');
    });

    test('should handle missing config', async () => {
      const result = await service.performHealthCheck();
      
      // configuration 체크가 없어야 함 (config가 제공되지 않았으므로)
      expect(result.checks.configuration).toBeUndefined();
      expect(result.checks.filesystem).toBeUndefined();
    });

    test('should include timestamp', async () => {
      const result = await service.performHealthCheck();
      
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
}); 
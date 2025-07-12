import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CategoryMappingService } from '../../services/CategoryMappingService.js';
import { promises as fs, existsSync } from 'fs';

// 파일 시스템 모킹
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

const mockedFs = jest.mocked(fs, true);
const mockedExistsSync = jest.mocked(existsSync, true);

describe('CategoryMappingService', () => {
  let service: CategoryMappingService;

  beforeEach(() => {
    service = new CategoryMappingService();
    jest.clearAllMocks();
  });

  describe('loadMapping', () => {
    test('should return default mapping when no custom file exists', async () => {
      mockedExistsSync.mockReturnValue(false);

      const mapping = await service.loadMapping('/test/docs');

      expect(mapping).toHaveProperty('company', '회사정보');
      expect(mapping).toHaveProperty('technical', '기술문서');
    });

    test('should load custom mapping and merge with defaults', async () => {
      const customMapping = {
        custom: '커스텀',
        company: '회사' // 기본값 덮어쓰기
      };

      mockedExistsSync.mockReturnValue(true);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(customMapping));

      const mapping = await service.loadMapping('/test/docs');

      expect(mapping).toHaveProperty('custom', '커스텀');
      expect(mapping).toHaveProperty('company', '회사');
      expect(mapping).toHaveProperty('technical', '기술문서'); // 기본값 유지
    });

    test('should cache mapping results', async () => {
      mockedExistsSync.mockReturnValue(false);

      await service.loadMapping('/test/docs');
      await service.loadMapping('/test/docs');

      expect(mockedExistsSync).toHaveBeenCalledTimes(1);
    });

    test('should handle JSON parsing errors gracefully', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedFs.readFile.mockResolvedValue('invalid json');

      const mapping = await service.loadMapping('/test/docs');

      // 기본 매핑만 반환되어야 함
      expect(mapping).toHaveProperty('company', '회사정보');
      expect(mapping).not.toHaveProperty('custom');
    });

    test('should handle file read errors gracefully', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedFs.readFile.mockRejectedValue(new Error('File read error'));

      const mapping = await service.loadMapping('/test/docs');

      // 기본 매핑만 반환되어야 함
      expect(mapping).toHaveProperty('company', '회사정보');
    });

    test('should validate custom mapping and reject invalid entries', async () => {
      const invalidMapping = {
        'valid-key': '유효한값',
        'invalid key with spaces': '유효한값',
        123: '숫자키',
        'valid_key': 123 // 값이 숫자
      };

      mockedExistsSync.mockReturnValue(true);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(invalidMapping));

      const mapping = await service.loadMapping('/test/docs');

      // 기본 매핑만 반환되어야 함 (유효하지 않은 매핑으로 인해)
      expect(mapping).toHaveProperty('company', '회사정보');
      expect(mapping).not.toHaveProperty('valid-key');
    });
  });

  describe('getCategory', () => {
    test('should return mapped category for known domain', () => {
      const mapping = { company: '회사정보', custom: '커스텀' };
      
      expect(service.getCategory('company', mapping)).toBe('회사정보');
      expect(service.getCategory('custom', mapping)).toBe('커스텀');
    });

    test('should return domain name for unknown domain', () => {
      const mapping = { company: '회사정보' };
      
      expect(service.getCategory('unknown', mapping)).toBe('unknown');
    });
  });

  describe('clearCache', () => {
    test('should clear cached mappings', async () => {
      mockedExistsSync.mockReturnValue(false);

      await service.loadMapping('/test/docs');
      service.clearCache();
      await service.loadMapping('/test/docs');

      expect(mockedExistsSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDefaultMapping', () => {
    test('should return copy of default mapping', () => {
      const defaultMapping1 = service.getDefaultMapping();
      const defaultMapping2 = service.getDefaultMapping();

      expect(defaultMapping1).toEqual(defaultMapping2);
      expect(defaultMapping1).not.toBe(defaultMapping2); // 다른 객체여야 함

      // 수정해도 원본에 영향 없어야 함
      defaultMapping1.test = '테스트';
      expect(defaultMapping2).not.toHaveProperty('test');
    });

    test('should contain expected default categories', () => {
      const defaultMapping = service.getDefaultMapping();

      expect(defaultMapping).toHaveProperty('company', '회사정보');
      expect(defaultMapping).toHaveProperty('customer', '고객서비스');
      expect(defaultMapping).toHaveProperty('product', '제품정보');
      expect(defaultMapping).toHaveProperty('technical', '기술문서');
      expect(defaultMapping).toHaveProperty('api', 'API문서');
      expect(defaultMapping).toHaveProperty('guide', '가이드');
    });
  });
});
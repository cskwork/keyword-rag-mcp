import { DomainDiscoveryService, Domain } from '../../services/DomainDiscoveryService.js';
import { CategoryMappingService } from '../../services/CategoryMappingService.js';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

// 파일 시스템 모킹
jest.mock('fs');
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
  },
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
}), { virtual: true });

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedFsSync = fsSync as jest.Mocked<typeof fsSync>;

describe('DomainDiscoveryService', () => {
  let service: DomainDiscoveryService;
  let mockCategoryService: jest.Mocked<CategoryMappingService>;

  beforeEach(() => {
    mockCategoryService = {
      loadMapping: jest.fn(),
      getCategory: jest.fn(),
      clearCache: jest.fn(),
      getDefaultMapping: jest.fn(),
    } as any;

    service = new DomainDiscoveryService(mockCategoryService);
    jest.clearAllMocks();
  });

  describe('discoverDomains', () => {
    test('should discover valid domains from directory structure', async () => {
      const mockDirEntries = [
        { name: 'company', isDirectory: () => true },
        { name: 'product', isDirectory: () => true },
        { name: 'file.md', isDirectory: () => false },
        { name: '.git', isDirectory: () => true }, // 숨김 폴더
        { name: 'node_modules', isDirectory: () => true }, // 시스템 폴더
      ];

      mockedFsSync.existsSync.mockReturnValue(true);
      mockedFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue(mockDirEntries as any);
      
      mockCategoryService.loadMapping.mockResolvedValue({
        company: '회사정보',
        product: '제품정보'
      });
      mockCategoryService.getCategory
        .mockReturnValueOnce('회사정보')
        .mockReturnValueOnce('제품정보');

      const domains = await service.discoverDomains('/test/docs');

      expect(domains).toHaveLength(2);
      expect(domains[0]).toEqual({
        name: 'company',
        path: 'company',
        category: '회사정보'
      });
      expect(domains[1]).toEqual({
        name: 'product',
        path: 'product',
        category: '제품정보'
      });
    });

    test('should handle invalid base path gracefully', async () => {
      mockedFsSync.existsSync.mockReturnValue(false);

      const domains = await service.discoverDomains('/invalid/path');

      expect(domains).toEqual([]);
    });

    test('should handle directory read errors gracefully', async () => {
      mockedFsSync.existsSync.mockReturnValue(true);
      mockedFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const domains = await service.discoverDomains('/test/docs');

      expect(domains).toEqual([]);
    });

    test('should filter out invalid directory names', async () => {
      const mockDirEntries = [
        { name: 'valid-domain', isDirectory: () => true },
        { name: 'invalid domain', isDirectory: () => true }, // 공백 포함
        { name: 'domain@invalid', isDirectory: () => true }, // 특수문자 포함
        { name: '123domain', isDirectory: () => true }, // 숫자로 시작
      ];

      mockedFsSync.existsSync.mockReturnValue(true);
      mockedFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue(mockDirEntries as any);
      
      mockCategoryService.loadMapping.mockResolvedValue({});
      mockCategoryService.getCategory.mockReturnValue('valid-domain');

      const domains = await service.discoverDomains('/test/docs');

      expect(domains).toHaveLength(1);
      expect(domains[0].name).toBe('valid-domain');
    });

    test('should sort domains by priority', async () => {
      const mockDirEntries = [
        { name: 'zebra', isDirectory: () => true },
        { name: 'technical', isDirectory: () => true },
        { name: 'company', isDirectory: () => true },
        { name: 'alpha', isDirectory: () => true },
        { name: 'customer', isDirectory: () => true },
        { name: 'product', isDirectory: () => true },
      ];

      mockedFsSync.existsSync.mockReturnValue(true);
      mockedFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue(mockDirEntries as any);
      
      mockCategoryService.loadMapping.mockResolvedValue({});
      mockCategoryService.getCategory.mockImplementation((name) => name);

      const domains = await service.discoverDomains('/test/docs');

      const domainNames = domains.map(d => d.name);
      expect(domainNames).toEqual(['company', 'customer', 'product', 'technical', 'alpha', 'zebra']);
    });

    test('should normalize domain names to lowercase', async () => {
      const mockDirEntries = [
        { name: 'COMPANY', isDirectory: () => true },
        { name: 'Product-Test', isDirectory: () => true },
      ];

      mockedFsSync.existsSync.mockReturnValue(true);
      mockedFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockedFs.readdir.mockResolvedValue(mockDirEntries as any);
      
      mockCategoryService.loadMapping.mockResolvedValue({});
      mockCategoryService.getCategory.mockImplementation((name) => name);

      const domains = await service.discoverDomains('/test/docs');

      expect(domains[0].name).toBe('company');
      expect(domains[0].path).toBe('COMPANY'); // 원본 경로 유지
      expect(domains[1].name).toBe('product-test');
      expect(domains[1].path).toBe('Product-Test'); // 원본 경로 유지
    });
  });

  describe('getDiscoveryStats', () => {
    test('should calculate correct statistics', () => {
      const domains: Domain[] = [
        { name: 'company', path: 'company', category: '회사정보' },
        { name: 'product', path: 'product', category: '제품정보' },
        { name: 'custom1', path: 'custom1', category: 'custom1' }, // 카테고리 = 이름
        { name: 'custom2', path: 'custom2', category: '커스텀2' },
      ];

      const stats = service.getDiscoveryStats(domains);

      expect(stats.totalDomains).toBe(4);
      expect(stats.categorizedDomains).toBe(3); // custom1 제외
      expect(stats.uncategorizedDomains).toBe(1); // custom1만
      expect(stats.categories).toEqual(['회사정보', '제품정보', '커스텀2', 'custom1'].sort());
    });

    test('should handle empty domain list', () => {
      const stats = service.getDiscoveryStats([]);

      expect(stats.totalDomains).toBe(0);
      expect(stats.categorizedDomains).toBe(0);
      expect(stats.uncategorizedDomains).toBe(0);
      expect(stats.categories).toEqual([]);
    });

    test('should remove duplicate categories', () => {
      const domains: Domain[] = [
        { name: 'company1', path: 'company1', category: '회사정보' },
        { name: 'company2', path: 'company2', category: '회사정보' },
        { name: 'product', path: 'product', category: '제품정보' },
      ];

      const stats = service.getDiscoveryStats(domains);

      expect(stats.categories).toEqual(['제품정보', '회사정보']);
      expect(stats.categories).toHaveLength(2);
    });
  });
});
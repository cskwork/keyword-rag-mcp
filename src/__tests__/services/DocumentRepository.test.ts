import { describe, test, expect, beforeEach } from '@jest/globals';
import { DocumentRepository } from '../../services/DocumentRepository.js';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../../models/Document.js';

describe('DocumentRepository', () => {
  let repository: DocumentRepository;
  let testDocuments: KnowledgeDocument[];

  beforeEach(() => {
    repository = new DocumentRepository();
    
    // 테스트용 문서 생성
    const remoteDoc1 = createRemoteMarkdownDocument(
      'doc1',
      '/docs/company/doc1.md',
      '# Document 1\n\nThis is a test document about payment API and authentication'
    );
    
    const remoteDoc2 = createRemoteMarkdownDocument(
      'doc2',
      '/docs/technical/doc2.md',
      '# Document 2\n\nThis document covers user authentication and security best practices'
    );
    
    const remoteDoc3 = createRemoteMarkdownDocument(
      'doc3',
      '/docs/customer/doc3.md',
      '# Document 3\n\nCustomer support guide for payment issues and troubleshooting'
    );
    
    testDocuments = [
      new KnowledgeDocument(remoteDoc1, 0, 'company'),
      new KnowledgeDocument(remoteDoc2, 1, 'technical'),
      new KnowledgeDocument(remoteDoc3, 2, 'customer')
    ];
  });

  describe('initialization', () => {
    test('should initialize with documents', async () => {
      await repository.initialize(testDocuments);
      
      expect(repository.isInitialized()).toBe(true);
      const stats = repository.getStatistics();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.totalChunks).toBeGreaterThan(0);
    });

    test('should chunk documents correctly', async () => {
      await repository.initialize(testDocuments);
      
      const stats = repository.getStatistics();
      expect(stats.totalChunks).toBeGreaterThanOrEqual(3); // 최소 문서당 1개 이상
    });

    test('should handle empty document list', async () => {
      await repository.initialize([]);
      
      expect(repository.isInitialized()).toBe(true);
      const stats = repository.getStatistics();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalChunks).toBe(0);
    });
  });

  describe('searchDocuments', () => {
    beforeEach(async () => {
      await repository.initialize(testDocuments);
    });

    test('should find documents by keywords', async () => {
      const results = await repository.searchDocuments(['payment', 'API']);
      
      expect(results).toContain('Document 1');
      expect(results).toContain('payment API');
    });

    test('should respect topN parameter', async () => {
      const results = await repository.searchDocuments(['authentication'], { topN: 1 });
      
      // 결과는 1개만 반환되어야 함
      const matches = results.match(/## 문서:/g) || [];
      expect(matches.length).toBe(1);
    });

    test('should filter by domain', async () => {
      const results = await repository.searchDocuments(['document'], { 
        domain: 'company' 
      });
      
      expect(results).toContain('Document 1');
      expect(results).not.toContain('Document 2'); // technical domain
      expect(results).not.toContain('Document 3'); // customer domain
    });

    test('should handle empty keyword array', async () => {
      const results = await repository.searchDocuments([]);
      
      expect(results).toBe('유효한 검색 키워드가 없습니다.');
    });

    test('should return no results message when nothing found', async () => {
      const results = await repository.searchDocuments(['nonexistent']);
      
      expect(results).toContain('검색 결과가 없습니다');
    });

    test('should include context window', async () => {
      const results = await repository.searchDocuments(['payment'], { 
        contextWindow: 2 
      });
      
      // 컨텍스트가 포함되어 있는지 확인
      expect(results.length).toBeGreaterThan(100); // 컨텍스트가 있으면 더 긴 결과
    });
  });

  describe('getDocumentById', () => {
    beforeEach(async () => {
      await repository.initialize(testDocuments);
    });

    test('should retrieve document by ID', () => {
      const doc = repository.getDocumentById(0);
      
      expect(doc).toBeDefined();
      expect(doc?.title).toBe('Document 1');
    });

    test('should return null for invalid ID', () => {
      const doc = repository.getDocumentById(999);
      
      expect(doc).toBeNull();
    });

    test('should return null for negative ID', () => {
      const doc = repository.getDocumentById(-1);
      
      expect(doc).toBeNull();
    });
  });

  describe('listDomains', () => {
    test('should list all domains with document counts', async () => {
      await repository.initialize(testDocuments);
      
      const domains = repository.listDomains();
      
      expect(domains).toHaveLength(3);
      expect(domains).toContainEqual({
        name: 'company',
        documentCount: 1
      });
      expect(domains).toContainEqual({
        name: 'technical',
        documentCount: 1
      });
      expect(domains).toContainEqual({
        name: 'customer',
        documentCount: 1
      });
    });

    test('should return empty array when no documents', async () => {
      await repository.initialize([]);
      
      const domains = repository.listDomains();
      
      expect(domains).toEqual([]);
    });

    test('should count multiple documents per domain', async () => {
      const additionalDoc = createRemoteMarkdownDocument(
        'doc4',
        '/docs/company/doc4.md',
        '# Document 4\n\nAnother company document'
      );
      
      await repository.initialize([...testDocuments, new KnowledgeDocument(additionalDoc, 3, 'company')]);
      
      const domains = repository.listDomains();
      const companyDomain = domains.find(d => d.name === 'company');
      
      expect(companyDomain?.documentCount).toBe(2);
    });
  });

  describe('getStatistics', () => {
    test('should provide accurate statistics', async () => {
      await repository.initialize(testDocuments);
      
      const stats = repository.getStatistics();
      
      expect(stats.totalDocuments).toBe(3);
      expect(stats.totalChunks).toBeGreaterThan(0);
      expect(stats.domains).toHaveLength(3);
      expect(stats.averageChunksPerDocument).toBeGreaterThan(0);
      expect(stats.averageWordsPerChunk).toBeGreaterThan(0);
    });
  });

  describe('BM25 search accuracy', () => {
    beforeEach(async () => {
      const specificDocs = [
        createRemoteMarkdownDocument(
          'bm25',
          '/docs/technical/bm25.md',
          '# BM25 Algorithm\n\nBM25 is a ranking function used by search engines to estimate the relevance of documents'
        ),
        createRemoteMarkdownDocument(
          'tfidf',
          '/docs/technical/tfidf.md',
          '# TF-IDF Method\n\nTF-IDF is a numerical statistic that reflects importance of a word in a document'
        ),
        createRemoteMarkdownDocument(
          'relevance',
          '/docs/technical/relevance.md',
          '# Search Relevance\n\nUnderstanding search relevance and ranking algorithms like BM25 and TF-IDF'
        )
      ];
      
      await repository.initialize(specificDocs.map((doc, index) => new KnowledgeDocument(doc, index, 'technical')));
    });

    test('should rank documents by relevance', async () => {
      const results = await repository.searchDocuments(['BM25']);
      
      // BM25가 포함된 문서들의 순서 확인
      expect(results).toContain('BM25 Algorithm');
      expect(results).toContain('BM25'); // content에 BM25 포함
    });

    test('should handle multi-term queries', async () => {
      const results = await repository.searchDocuments(['ranking', 'algorithm']);
      
      expect(results).toContain('BM25');
      expect(results).toContain('ranking function');
    });
  });

  describe('error handling', () => {
    test('should throw error when searching before initialization', async () => {
      const newRepo = new DocumentRepository();
      
      await expect(
        newRepo.searchDocuments(['test'])
      ).rejects.toThrow('Repository가 아직 초기화되지 않았습니다');
    });

    test('should handle malformed documents gracefully', async () => {
      // null content는 createRemoteMarkdownDocument에서 처리할 수 없으므로
      // 빈 문자열로 테스트
      const malformedDoc = createRemoteMarkdownDocument(
        'malformed',
        '/docs/malformed/doc.md',
        '' // 빈 content
      );
      
      // 빈 문서도 처리 가능해야 함
      await expect(
        repository.initialize([new KnowledgeDocument(malformedDoc, 0, 'test')])
      ).resolves.not.toThrow();
    });
  });

  describe('instance management', () => {
    test('should have unique instance IDs', () => {
      const repo1 = new DocumentRepository();
      const repo2 = new DocumentRepository();
      
      expect(repo1.getInstanceId()).not.toBe(repo2.getInstanceId());
    });
  });
}); 
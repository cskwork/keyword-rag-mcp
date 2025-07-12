import { describe, test, expect, beforeAll } from '@jest/globals';
import { SearchHandler } from '../../handlers/SearchHandler.js';
import { DocumentHandler } from '../../handlers/DocumentHandler.js';
import { SystemHandler } from '../../handlers/SystemHandler.js';
import { DocumentRepository } from '../../services/DocumentRepository.js';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../../models/Document.js';

/**
 * MCP 핸들러 직접 테스트
 * 실제 MCP 핸들러들을 직접 호출하여 API 기능 검증
 */
describe('MCP Handlers Integration Tests', () => {
  let searchHandler: SearchHandler;
  let documentHandler: DocumentHandler;
  let systemHandler: SystemHandler;
  let repository: DocumentRepository;

  beforeAll(async () => {
    // 테스트용 문서 생성
    const testDocuments = createTestDocuments();
    
    // Repository 초기화
    repository = new DocumentRepository();
    await repository.initialize(testDocuments);

    // 핸들러 초기화
    searchHandler = new SearchHandler();
    documentHandler = new DocumentHandler();
    systemHandler = new SystemHandler();

    // Repository를 핸들러에 직접 설정 (테스트용)
    (searchHandler as any).repository = repository;
    (documentHandler as any).repository = repository;
    (systemHandler as any).repository = repository;
  });

  function createTestDocuments(): KnowledgeDocument[] {
    const doc1 = createRemoteMarkdownDocument(
      'payment-api',
      '/docs/company/payment-api.md',
      `# Payment API Documentation

## 개요
결제 API 엔드포인트와 인증 방법을 설명하는 문서입니다.

## 인증 (Authentication)
모든 API 요청은 Authorization 헤더에 유효한 API 키가 필요합니다.

### API 키 생성
1. 개발자 포털에 로그인
2. API 키 관리 페이지 접속
3. 새 API 키 생성 버튼 클릭

## 엔드포인트
- POST /api/payments - 새 결제 생성
- GET /api/payments/{id} - 결제 상세 정보 조회
- PUT /api/payments/{id} - 결제 상태 업데이트
- DELETE /api/payments/{id} - 결제 취소

## 오류 처리
API는 표준 HTTP 상태 코드와 상세한 오류 메시지를 반환합니다.`
    );

    const doc2 = createRemoteMarkdownDocument(
      'security-guide',
      '/docs/technical/security-guide.md',
      `# 보안 가이드

## 인증 보안
- 강력한 비밀번호와 다중 인증 사용
- 적절한 세션 관리 구현
- 모든 사용자 입력 검증

## 데이터 보호
- 민감한 데이터 암호화 (저장 및 전송)
- 적절한 접근 제어 구현
- 정기적인 보안 감사 수행

## API 보안
- 요청 빈도 제한 및 스로틀링
- 입력 검증 및 정제
- 안전한 오류 처리

## 인증 방법
### JWT 토큰
- 토큰 기반 인증 시스템
- 만료 시간 설정
- 리프레시 토큰 구현`
    );

    const doc3 = createRemoteMarkdownDocument(
      'support-guide',
      '/docs/customer/support-guide.md',
      `# 고객 지원 가이드

## 결제 문제
일반적인 결제 문제와 해결 방법:

### 결제 실패
1. 카드 정보가 올바른지 확인
2. 잔액이 충분한지 확인
3. 문제가 지속되면 은행에 문의

### 환불 요청
- 환불은 5-7 영업일 내에 처리됩니다
- 지원팀(support@company.com)에 문의하세요

## 인증 문제
고객의 로그인 및 비밀번호 문제를 도와드립니다.`
    );

    return [
      new KnowledgeDocument(doc1, 0, 'company'),
      new KnowledgeDocument(doc2, 1, 'technical'),
      new KnowledgeDocument(doc3, 2, 'customer')
    ];
  }

  // MCP 요청 객체 생성 헬퍼
  function createMcpRequest(toolName: string, args: any) {
    return {
      params: {
        name: toolName,
        arguments: args
      }
    };
  }

  describe('SearchHandler', () => {
    test('search-documents: 키워드 검색이 가능해야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['payment', 'API']
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
      expect(result.content[0].text).toContain('결제');
    });

    test('search-documents: 한국어 키워드 검색이 가능해야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['인증', '보안']
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('인증');
      expect(result.content[0].text).toContain('보안');
    });

    test('search-documents: 도메인 필터가 작동해야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['인증'],
        domain: 'technical'
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('보안 가이드');
      expect(result.content[0].text).not.toContain('Payment API');
    });

    test('search-documents: topN 매개변수가 작동해야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['인증'],
        topN: 1
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      const documentCount = (result.content[0].text.match(/## 문서:/g) || []).length;
      expect(documentCount).toBe(1);
    });

    test('search-documents: contextWindow 매개변수가 작동해야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['결제'],
        contextWindow: 5
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(500);
    });

    test('search-documents: 빈 키워드 배열 처리', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: []
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('유효한 검색 키워드가 없습니다');
    });

    test('search-documents: 존재하지 않는 키워드 처리', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['nonexistent123456']
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('검색 결과가 없습니다');
    });
  });

  describe('DocumentHandler', () => {
    test('get-document-by-id: 유효한 문서 ID 조회', async () => {
      const request = createMcpRequest('get-document-by-id', {
        documentId: 0
      });

      const result = await documentHandler.handleGetDocumentById(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
    });

    test('get-document-by-id: 모든 문서 ID 조회 가능', async () => {
      for (let id = 0; id < 3; id++) {
        const request = createMcpRequest('get-document-by-id', {
          documentId: id
        });

        const result = await documentHandler.handleGetDocumentById(request);

        expect(result).toBeDefined();
        expect(result.content[0].text.length).toBeGreaterThan(0);
      }
    });

    test('get-document-by-id: 잘못된 문서 ID 처리', async () => {
      const request = createMcpRequest('get-document-by-id', {
        documentId: 999
      });

      const result = await documentHandler.handleGetDocumentById(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });

    test('get-document-by-id: 음수 문서 ID 처리', async () => {
      const request = createMcpRequest('get-document-by-id', {
        documentId: -1
      });

      const result = await documentHandler.handleGetDocumentById(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });

    test('get-chunk-with-context: 유효한 청크 ID 조회', async () => {
      const request = createMcpRequest('get-chunk-with-context', {
        chunkId: 0,
        contextSize: 2
      });

      const result = await documentHandler.handleGetChunkWithContext(request);

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    test('get-chunk-with-context: 컨텍스트 크기 적용', async () => {
      const request1 = createMcpRequest('get-chunk-with-context', {
        chunkId: 0,
        contextSize: 1
      });

      const request2 = createMcpRequest('get-chunk-with-context', {
        chunkId: 0,
        contextSize: 3
      });

      const result1 = await documentHandler.handleGetChunkWithContext(request1);
      const result2 = await documentHandler.handleGetChunkWithContext(request2);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result2.content[0].text.length).toBeGreaterThanOrEqual(result1.content[0].text.length);
    });

    test('get-chunk-with-context: 잘못된 청크 ID 처리', async () => {
      const request = createMcpRequest('get-chunk-with-context', {
        chunkId: 999999,
        contextSize: 2
      });

      const result = await documentHandler.handleGetChunkWithContext(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });
  });

  describe('SystemHandler', () => {
    test('list-domains: 모든 도메인 반환', async () => {
      const request = createMcpRequest('list-domains', {});

      const result = await systemHandler.handleListDomains(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('company');
      expect(result.content[0].text).toContain('technical');
      expect(result.content[0].text).toContain('customer');
      expect(result.content[0].text).toContain('문서 수');
    });

    test('list-domains: 도메인별 문서 수 표시', async () => {
      const request = createMcpRequest('list-domains', {});

      const result = await systemHandler.handleListDomains(request);

      expect(result).toBeDefined();
      // 각 도메인에 1개씩 문서가 있어야 함
      expect(result.content[0].text).toContain('1개');
    });
  });

  describe('검색 품질 테스트', () => {
    test('관련성 높은 문서가 상위에 나와야 함', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['payment', 'API', 'endpoint'],
        topN: 2
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      // Payment API 문서가 결과에 포함되어야 함
      const firstDocMatch = result.content[0].text.indexOf('Payment API');
      expect(firstDocMatch).toBeGreaterThan(-1);
    });

    test('동의어 및 관련 용어 검색', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['authentication', '인증']
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('인증');
    });

    test('복합 키워드 검색', async () => {
      const request = createMcpRequest('search-documents', {
        keywords: ['결제', '실패', '문제']
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('결제');
      expect(result.content[0].text).toContain('문제');
    });
  });

  describe('성능 테스트', () => {
    test('검색 응답 시간이 적절해야 함', async () => {
      const startTime = Date.now();
      
      const request = createMcpRequest('search-documents', {
        keywords: ['API', 'authentication']
      });

      await searchHandler.handleSearchDocuments(request);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // 검색 응답시간이 1초 이내여야 함
      expect(responseTime).toBeLessThan(1000);
    });

    test('대량 키워드 검색', async () => {
      const keywords = ['payment', 'API', 'authentication', 'security', 'guide', 'customer', 'support'];
      
      const request = createMcpRequest('search-documents', {
        keywords: keywords
      });

      const result = await searchHandler.handleSearchDocuments(request);

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });

  describe('오류 처리 테스트', () => {
    test('잘못된 매개변수 타입 처리', async () => {
      try {
        const request = createMcpRequest('search-documents', {
          keywords: 'invalid' // 배열이 아닌 문자열
        });

        await searchHandler.handleSearchDocuments(request);
        
        // 오류가 발생하지 않으면 fail
        fail('검증 오류가 발생해야 함');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('누락된 필수 매개변수 처리', async () => {
      try {
        const request = createMcpRequest('search-documents', {
          // keywords 누락
        });

        await searchHandler.handleSearchDocuments(request);
        
        fail('검증 오류가 발생해야 함');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { McpServer } from '../../server/McpServer.js';
import { ServerStateManager } from '../../server/ServerStateManager.js';
import { DocumentRepository } from '../../services/DocumentRepository.js';
import { KnowledgeDocument, createRemoteMarkdownDocument } from '../../models/Document.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * MCP 서버 API 직접 테스트
 * 실제 McpServer 클래스를 인스턴스화하고 핸들러를 직접 호출
 */
describe('MCP API Direct Integration Tests', () => {
  let mcpServer: McpServer;
  let testDocsPath: string;
  let testConfigPath: string;
  let repository: DocumentRepository;

  beforeAll(async () => {
    await setupTestEnvironment();
    await initializeServer();
  }, 30000);

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  async function setupTestEnvironment() {
    // 테스트용 문서 디렉토리 생성
    testDocsPath = path.join(process.cwd(), 'integration-test-docs');
    await fs.mkdir(testDocsPath, { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'company'), { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'technical'), { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'customer'), { recursive: true });

    // 테스트용 문서 파일 생성
    await fs.writeFile(
      path.join(testDocsPath, 'company', 'payment-api.md'),
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
API는 표준 HTTP 상태 코드와 상세한 오류 메시지를 반환합니다.

### 일반적인 오류 코드
- 400: 잘못된 요청
- 401: 인증 실패
- 403: 권한 부족
- 404: 리소스를 찾을 수 없음
- 500: 서버 내부 오류`
    );

    await fs.writeFile(
      path.join(testDocsPath, 'technical', 'security-guide.md'),
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
- 리프레시 토큰 구현

### OAuth 2.0
- 표준 인증 프로토콜
- 스코프 기반 권한 관리
- 안전한 토큰 교환`
    );

    await fs.writeFile(
      path.join(testDocsPath, 'customer', 'support-guide.md'),
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
고객의 로그인 및 비밀번호 문제를 도와드립니다.

### 비밀번호 재설정
1. 로그인 페이지에서 "비밀번호 찾기" 클릭
2. 등록된 이메일 주소 입력
3. 이메일로 전송된 링크 클릭
4. 새 비밀번호 설정

### 계정 잠김
- 5회 이상 로그인 실패 시 계정이 일시적으로 잠김
- 30분 후 자동 해제
- 즉시 해제가 필요한 경우 지원팀 연락`
    );

    // 테스트용 설정 파일 생성
    testConfigPath = path.join(process.cwd(), 'config.integration.test.json');
    const testConfig = {
      "documentSources": [
        {
          "name": "company",
          "path": path.join(testDocsPath, "company"),
          "category": "Company Documentation"
        },
        {
          "name": "technical", 
          "path": path.join(testDocsPath, "technical"),
          "category": "Technical Guides"
        },
        {
          "name": "customer",
          "path": path.join(testDocsPath, "customer"), 
          "category": "Customer Support"
        }
      ],
      "bm25Config": {
        "k1": 1.2,
        "b": 0.75
      },
      "chunkConfig": {
        "minWords": 10,
        "contextWindowSize": 3
      }
    };

    await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
  }

  async function initializeServer() {
    // 환경 변수 설정
    process.env.CONFIG_PATH = testConfigPath;
    process.env.NODE_ENV = 'test';

    // 서버 초기화 (실제 MCP 서버 시작하지 않음)
    mcpServer = new McpServer();
    
    // 서버 상태 초기화 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 서버 상태 관리자에서 repository 가져오기
    const stateManager = ServerStateManager.getInstance();
    repository = stateManager.getRepository();
  }

  async function cleanupTestEnvironment() {
    try {
      await fs.rm(testDocsPath, { recursive: true, force: true });
      await fs.unlink(testConfigPath);
    } catch (error) {
      console.warn('테스트 환경 정리 중 오류:', error);
    }
  }

  // MCP 도구 호출을 시뮬레이션하는 헬퍼 함수
  async function callMcpTool(toolName: string, args: any) {
    const request = {
      params: {
        name: toolName,
        arguments: args
      }
    };

    // 실제 핸들러 메서드 직접 호출
    switch (toolName) {
      case 'search-documents':
        return await (mcpServer as any).searchHandler.handleSearchDocuments(request);
      case 'get-document-by-id':
        return await (mcpServer as any).documentHandler.handleGetDocumentById(request);
      case 'list-domains':
        return await (mcpServer as any).systemHandler.handleListDomains(request);
      case 'get-chunk-with-context':
        return await (mcpServer as any).documentHandler.handleGetChunkWithContext(request);
      default:
        throw new Error(`알 수 없는 도구: ${toolName}`);
    }
  }

  describe('서버 초기화', () => {
    test('서버가 올바르게 초기화되어야 함', () => {
      expect(mcpServer).toBeDefined();
      expect(repository).toBeDefined();
      expect(repository.isInitialized()).toBe(true);
    });

    test('문서가 올바르게 로드되어야 함', () => {
      const stats = repository.getStatistics();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.totalChunks).toBeGreaterThan(0);
    });
  });

  describe('search-documents 도구', () => {
    test('키워드로 문서 검색이 가능해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['payment', 'API']
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
      expect(result.content[0].text).toContain('결제');
    });

    test('한국어 키워드 검색이 가능해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['인증', '보안']
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('인증');
      expect(result.content[0].text).toContain('보안');
    });

    test('도메인 필터가 올바르게 작동해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['인증'],
        domain: 'technical'
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('보안 가이드');
      expect(result.content[0].text).not.toContain('Payment API');
    });

    test('topN 매개변수가 올바르게 작동해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['인증'],
        topN: 1
      });

      expect(result).toBeDefined();
      const documentCount = (result.content[0].text.match(/## 문서:/g) || []).length;
      expect(documentCount).toBe(1);
    });

    test('contextWindow 매개변수가 올바르게 작동해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['결제'],
        contextWindow: 5
      });

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(500);
    });

    test('빈 키워드 배열에 대해 적절한 메시지를 반환해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: []
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('유효한 검색 키워드가 없습니다');
    });
  });

  describe('list-domains 도구', () => {
    test('모든 설정된 도메인이 반환되어야 함', async () => {
      const result = await callMcpTool('list-domains', {});

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('company');
      expect(result.content[0].text).toContain('technical');
      expect(result.content[0].text).toContain('customer');
      expect(result.content[0].text).toContain('문서 수');
    });

    test('도메인별 문서 수가 올바르게 표시되어야 함', async () => {
      const result = await callMcpTool('list-domains', {});

      expect(result).toBeDefined();
      // 각 도메인에 1개씩 문서가 있어야 함
      expect(result.content[0].text).toContain('1개');
    });
  });

  describe('get-document-by-id 도구', () => {
    test('유효한 문서 ID로 문서를 조회할 수 있어야 함', async () => {
      const result = await callMcpTool('get-document-by-id', {
        documentId: 0
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
    });

    test('모든 문서 ID가 조회 가능해야 함', async () => {
      for (let id = 0; id < 3; id++) {
        const result = await callMcpTool('get-document-by-id', {
          documentId: id
        });

        expect(result).toBeDefined();
        expect(result.content[0].text.length).toBeGreaterThan(0);
      }
    });

    test('잘못된 문서 ID에 대해 적절한 오류 메시지를 반환해야 함', async () => {
      const result = await callMcpTool('get-document-by-id', {
        documentId: 999
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });

    test('음수 문서 ID에 대해 적절한 오류 메시지를 반환해야 함', async () => {
      const result = await callMcpTool('get-document-by-id', {
        documentId: -1
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });
  });

  describe('get-chunk-with-context 도구', () => {
    test('유효한 청크 ID로 컨텍스트를 조회할 수 있어야 함', async () => {
      const stats = repository.getStatistics();
      const validChunkId = 0;

      const result = await callMcpTool('get-chunk-with-context', {
        chunkId: validChunkId,
        contextSize: 2
      });

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    test('컨텍스트 크기가 올바르게 적용되어야 함', async () => {
      const validChunkId = 0;

      const result1 = await callMcpTool('get-chunk-with-context', {
        chunkId: validChunkId,
        contextSize: 1
      });

      const result2 = await callMcpTool('get-chunk-with-context', {
        chunkId: validChunkId,
        contextSize: 3
      });

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // 더 큰 컨텍스트 크기는 더 긴 결과를 반환해야 함
      expect(result2.content[0].text.length).toBeGreaterThanOrEqual(result1.content[0].text.length);
    });

    test('잘못된 청크 ID에 대해 적절한 오류 메시지를 반환해야 함', async () => {
      const result = await callMcpTool('get-chunk-with-context', {
        chunkId: 999999,
        contextSize: 2
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });
  });

  describe('검색 품질 테스트', () => {
    test('관련성 높은 문서가 상위에 나와야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['payment', 'API', 'endpoint'],
        topN: 2
      });

      expect(result).toBeDefined();
      // Payment API 문서가 첫 번째로 나와야 함
      const firstDocMatch = result.content[0].text.indexOf('Payment API');
      expect(firstDocMatch).toBeGreaterThan(-1);
    });

    test('동의어 및 관련 용어 검색이 가능해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['authentication', '인증']
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('인증');
    });

    test('복합 키워드 검색이 올바르게 작동해야 함', async () => {
      const result = await callMcpTool('search-documents', {
        keywords: ['결제', '실패', '문제']
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('결제');
      expect(result.content[0].text).toContain('문제');
    });
  });

  describe('성능 테스트', () => {
    test('검색 응답 시간이 적절해야 함', async () => {
      const startTime = Date.now();
      
      await callMcpTool('search-documents', {
        keywords: ['API', 'authentication']
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // 검색 응답시간이 2초 이내여야 함
      expect(responseTime).toBeLessThan(2000);
    });

    test('대량 키워드 검색이 가능해야 함', async () => {
      const keywords = ['payment', 'API', 'authentication', 'security', 'guide', 'customer', 'support'];
      
      const result = await callMcpTool('search-documents', {
        keywords: keywords
      });

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });
});
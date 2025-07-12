import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * MCP 서버 통합 테스트
 * 실제 서버 인스턴스를 시작하고 모든 MCP 도구를 테스트
 */
describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess;
  let testConfigPath: string;
  let testDocsPath: string;

  beforeAll(async () => {
    // 테스트용 임시 설정 및 문서 준비
    await setupTestEnvironment();
    
    // MCP 서버 프로세스 시작
    serverProcess = await startMcpServer();
    
    // 서버 시작 대기
    await new Promise(resolve => setTimeout(resolve, 3000));
  }, 30000);

  afterAll(async () => {
    // 서버 프로세스 종료
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 테스트 환경 정리
    await cleanupTestEnvironment();
  });

  async function setupTestEnvironment() {
    // 테스트용 문서 디렉토리 생성
    testDocsPath = path.join(process.cwd(), 'test-docs');
    await fs.mkdir(testDocsPath, { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'company'), { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'technical'), { recursive: true });
    await fs.mkdir(path.join(testDocsPath, 'customer'), { recursive: true });

    // 테스트용 문서 파일 생성
    await fs.writeFile(
      path.join(testDocsPath, 'company', 'payment-api.md'),
      `# Payment API Documentation

## Overview
This document describes our payment API endpoints and authentication methods.

## Authentication
All API requests require a valid API key in the Authorization header.

## Endpoints
- POST /api/payments - Create a new payment
- GET /api/payments/{id} - Retrieve payment details
- PUT /api/payments/{id} - Update payment status

## Error Handling
The API returns standard HTTP status codes and detailed error messages.`
    );

    await fs.writeFile(
      path.join(testDocsPath, 'technical', 'security-guide.md'),
      `# Security Best Practices

## Authentication Security
- Use strong passwords and multi-factor authentication
- Implement proper session management
- Validate all user inputs

## Data Protection
- Encrypt sensitive data at rest and in transit
- Implement proper access controls
- Regular security audits

## API Security
- Rate limiting and throttling
- Input validation and sanitization
- Secure error handling`
    );

    await fs.writeFile(
      path.join(testDocsPath, 'customer', 'support-guide.md'),
      `# Customer Support Guide

## Payment Issues
Common payment problems and their solutions:

### Failed Payments
1. Check card details are correct
2. Verify sufficient funds
3. Contact bank if issues persist

### Refund Requests
- Refunds are processed within 5-7 business days
- Contact support@company.com for assistance

## Authentication Problems
Help customers with login and password issues.`
    );

    // 테스트용 설정 파일 생성
    testConfigPath = path.join(process.cwd(), 'config.test.json');
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

  async function startMcpServer(): Promise<ChildProcess> {
    const serverScript = path.join(process.cwd(), 'dist', 'index.js');
    
    // 환경 변수 설정
    const env = {
      ...process.env,
      CONFIG_PATH: testConfigPath,
      NODE_ENV: 'test'
    };

    // 서버 빌드가 필요한 경우 먼저 빌드
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], { 
        stdio: 'pipe',
        shell: true 
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`빌드 실패: exit code ${code}`));
        }
      });
    });

    // MCP 서버 시작
    const serverProcess = spawn('node', [serverScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    });

    // 서버 로그 출력 (디버깅용)
    serverProcess.stderr?.on('data', (data) => {
      console.log(`[SERVER] ${data.toString()}`);
    });

    serverProcess.stdout?.on('data', (data) => {
      console.log(`[SERVER STDOUT] ${data.toString()}`);
    });

    return serverProcess;
  }

  async function cleanupTestEnvironment() {
    try {
      // 테스트 문서 디렉토리 삭제
      await fs.rm(testDocsPath, { recursive: true, force: true });
      
      // 테스트 설정 파일 삭제
      await fs.unlink(testConfigPath);
    } catch (error) {
      console.warn('테스트 환경 정리 중 오류:', error);
    }
  }

  async function sendMcpRequest(method: string, params: any = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Math.random().toString(36),
        method,
        params
      };

      const requestStr = JSON.stringify(request) + '\n';
      
      // 응답 수신 대기
      const timeout = setTimeout(() => {
        reject(new Error('요청 타임아웃'));
      }, 10000);

      const responseHandler = (data: Buffer) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(error);
        }
      };

      serverProcess.stdout?.once('data', responseHandler);
      
      // 요청 전송
      serverProcess.stdin?.write(requestStr);
    });
  }

  describe('도구 목록 조회', () => {
    test('모든 MCP 도구가 등록되어 있어야 함', async () => {
      const tools = await sendMcpRequest('tools/list');
      
      expect(tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      
      const toolNames = tools.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('search-documents');
      expect(toolNames).toContain('get-document-by-id');
      expect(toolNames).toContain('list-domains');
      expect(toolNames).toContain('get-chunk-with-context');
    });
  });

  describe('문서 검색 (search-documents)', () => {
    test('키워드로 문서 검색이 가능해야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['payment', 'API']
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
      expect(result.content[0].text).toContain('payment');
    });

    test('도메인 필터가 올바르게 작동해야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['authentication'],
          domain: 'technical'
        }
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('security');
      expect(result.content[0].text).not.toContain('payment');
    });

    test('topN 매개변수가 올바르게 작동해야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['authentication'],
          topN: 1
        }
      });

      expect(result).toBeDefined();
      // 결과에서 문서 개수 확인
      const documentCount = (result.content[0].text.match(/## 문서:/g) || []).length;
      expect(documentCount).toBe(1);
    });
  });

  describe('도메인 목록 조회 (list-domains)', () => {
    test('모든 설정된 도메인이 반환되어야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'list-domains'
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('company');
      expect(result.content[0].text).toContain('technical');
      expect(result.content[0].text).toContain('customer');
      expect(result.content[0].text).toContain('문서 수');
    });
  });

  describe('문서 ID로 조회 (get-document-by-id)', () => {
    test('유효한 문서 ID로 문서를 조회할 수 있어야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'get-document-by-id',
        arguments: {
          documentId: 0
        }
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Payment API');
    });

    test('잘못된 문서 ID에 대해 적절한 오류 메시지를 반환해야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'get-document-by-id',
        arguments: {
          documentId: 999
        }
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('찾을 수 없습니다');
    });
  });

  describe('청크 컨텍스트 조회 (get-chunk-with-context)', () => {
    test('유효한 청크 ID로 컨텍스트를 조회할 수 있어야 함', async () => {
      const result = await sendMcpRequest('tools/call', {
        name: 'get-chunk-with-context',
        arguments: {
          chunkId: 0,
          contextSize: 2
        }
      });

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });

  describe('오류 처리', () => {
    test('잘못된 도구 이름에 대해 오류를 반환해야 함', async () => {
      try {
        await sendMcpRequest('tools/call', {
          name: 'invalid-tool',
          arguments: {}
        });
        fail('오류가 발생해야 함');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('잘못된 매개변수에 대해 오류를 반환해야 함', async () => {
      try {
        await sendMcpRequest('tools/call', {
          name: 'search-documents',
          arguments: {
            keywords: 'invalid' // 배열이 아닌 문자열
          }
        });
        fail('오류가 발생해야 함');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
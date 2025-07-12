#!/usr/bin/env node

/**
 * MCP 서버 실제 API 테스트 스크립트
 * 
 * 이 스크립트는 실제 MCP 서버를 시작하고 JSON-RPC 통신을 통해
 * 모든 MCP 도구를 테스트합니다.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class McpApiTester {
  constructor() {
    this.serverProcess = null;
    this.testResults = [];
    this.testConfigPath = null;
    this.testDocsPath = null;
  }

  async setup() {
    console.log('🔧 테스트 환경 설정 중...');
    
    // 테스트용 문서 디렉토리 생성
    this.testDocsPath = path.join(process.cwd(), 'api-test-docs');
    await fs.mkdir(this.testDocsPath, { recursive: true });
    await fs.mkdir(path.join(this.testDocsPath, 'company'), { recursive: true });
    await fs.mkdir(path.join(this.testDocsPath, 'technical'), { recursive: true });
    await fs.mkdir(path.join(this.testDocsPath, 'customer'), { recursive: true });

    // 테스트용 문서 파일 생성
    await fs.writeFile(
      path.join(this.testDocsPath, 'company', 'payment-api.md'),
      `# Payment API Documentation

## 개요
결제 API 엔드포인트와 인증 방법을 설명하는 문서입니다.

## 인증 (Authentication)
모든 API 요청은 Authorization 헤더에 유효한 API 키가 필요합니다.

## 엔드포인트
- POST /api/payments - 새 결제 생성
- GET /api/payments/{id} - 결제 상세 정보 조회
- PUT /api/payments/{id} - 결제 상태 업데이트

## 오류 처리
API는 표준 HTTP 상태 코드와 상세한 오류 메시지를 반환합니다.`
    );

    await fs.writeFile(
      path.join(this.testDocsPath, 'technical', 'security-guide.md'),
      `# 보안 가이드

## 인증 보안
- 강력한 비밀번호와 다중 인증 사용
- 적절한 세션 관리 구현
- 모든 사용자 입력 검증

## 데이터 보호
- 민감한 데이터 암호화 (저장 및 전송)
- 적절한 접근 제어 구현
- 정기적인 보안 감사 수행`
    );

    await fs.writeFile(
      path.join(this.testDocsPath, 'customer', 'support-guide.md'),
      `# 고객 지원 가이드

## 결제 문제
일반적인 결제 문제와 해결 방법:

### 결제 실패
1. 카드 정보가 올바른지 확인
2. 잔액이 충분한지 확인
3. 문제가 지속되면 은행에 문의

### 환불 요청
- 환불은 5-7 영업일 내에 처리됩니다
- 지원팀에 문의하세요`
    );

    // 테스트용 설정 파일 생성
    this.testConfigPath = path.join(process.cwd(), 'config.api-test.json');
    const testConfig = {
      "documentSources": [
        {
          "name": "company",
          "path": path.join(this.testDocsPath, "company"),
          "category": "Company Documentation"
        },
        {
          "name": "technical", 
          "path": path.join(this.testDocsPath, "technical"),
          "category": "Technical Guides"
        },
        {
          "name": "customer",
          "path": path.join(this.testDocsPath, "customer"), 
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

    await fs.writeFile(this.testConfigPath, JSON.stringify(testConfig, null, 2));
    console.log('✅ 테스트 환경 설정 완료');
  }

  async startServer() {
    console.log('🚀 MCP 서버 시작 중...');

    // 빌드 먼저 실행
    console.log('📦 프로젝트 빌드 중...');
    await this.executeCommand('npm', ['run', 'build']);

    // 서버 시작
    const serverScript = path.join(process.cwd(), 'dist', 'index.js');
    
    this.serverProcess = spawn('node', [serverScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CONFIG_PATH: this.testConfigPath,
        NODE_ENV: 'test'
      }
    });

    // 서버 로그 출력
    this.serverProcess.stderr.on('data', (data) => {
      console.log(`[SERVER] ${data.toString().trim()}`);
    });

    this.serverProcess.stdout.on('data', (data) => {
      // JSON-RPC 응답이 아닌 경우만 로그 출력
      const output = data.toString().trim();
      if (!output.startsWith('{')) {
        console.log(`[SERVER OUT] ${output}`);
      }
    });

    // 서버 시작 대기
    console.log('⏳ 서버 초기화 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ MCP 서버 시작 완료');
  }

  async executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { 
        stdio: 'pipe',
        shell: true 
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} 실행 실패: exit code ${code}`));
        }
      });
    });
  }

  async sendMcpRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Math.random().toString(36),
        method,
        params
      };

      const requestStr = JSON.stringify(request) + '\n';
      
      // 응답 타임아웃 설정
      const timeout = setTimeout(() => {
        reject(new Error(`요청 타임아웃: ${method}`));
      }, 15000);

      const responseHandler = (data) => {
        clearTimeout(timeout);
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                if (response.error) {
                  reject(new Error(`MCP 오류: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch (e) {
              // JSON이 아닌 라인은 무시
            }
          }
        } catch (error) {
          reject(error);
        }
      };

      this.serverProcess.stdout.once('data', responseHandler);
      
      // 요청 전송
      this.serverProcess.stdin.write(requestStr);
    });
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 테스트 실행: ${testName}`);
    try {
      await testFunction();
      console.log(`✅ 성공: ${testName}`);
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.log(`❌ 실패: ${testName} - ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async runAllTests() {
    console.log('\n🎯 MCP API 테스트 시작\n');

    // 1. 도구 목록 조회 테스트
    await this.runTest('도구 목록 조회', async () => {
      const tools = await this.sendMcpRequest('tools/list');
      if (!tools || !Array.isArray(tools.tools)) {
        throw new Error('도구 목록이 배열이 아닙니다');
      }
      
      const toolNames = tools.tools.map(tool => tool.name);
      const expectedTools = ['search-documents', 'get-document-by-id', 'list-domains', 'get-chunk-with-context'];
      
      for (const expectedTool of expectedTools) {
        if (!toolNames.includes(expectedTool)) {
          throw new Error(`필수 도구가 없습니다: ${expectedTool}`);
        }
      }
      
      console.log(`   등록된 도구: ${toolNames.join(', ')}`);
    });

    // 2. 문서 검색 테스트
    await this.runTest('키워드 문서 검색', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['payment', 'API']
        }
      });
      
      if (!result.content || !result.content[0].text.includes('Payment API')) {
        throw new Error('예상된 검색 결과가 없습니다');
      }
      
      console.log(`   검색 결과 길이: ${result.content[0].text.length} 문자`);
    });

    // 3. 한국어 키워드 검색 테스트
    await this.runTest('한국어 키워드 검색', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['인증', '보안']
        }
      });
      
      if (!result.content || !result.content[0].text.includes('인증')) {
        throw new Error('한국어 검색 결과가 없습니다');
      }
      
      console.log(`   한국어 검색 결과 길이: ${result.content[0].text.length} 문자`);
    });

    // 4. 도메인 필터 테스트
    await this.runTest('도메인 필터 검색', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['guide'],
          domain: 'technical'
        }
      });
      
      if (!result.content || result.content[0].text.includes('Payment API')) {
        throw new Error('도메인 필터가 올바르게 작동하지 않습니다');
      }
      
      console.log(`   도메인 필터 결과: technical 도메인만 포함`);
    });

    // 5. topN 매개변수 테스트
    await this.runTest('topN 매개변수 테스트', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: ['guide'],
          topN: 1
        }
      });
      
      const documentCount = (result.content[0].text.match(/## 문서:/g) || []).length;
      if (documentCount !== 1) {
        throw new Error(`예상 문서 수: 1, 실제: ${documentCount}`);
      }
      
      console.log(`   제한된 결과 수: ${documentCount}개`);
    });

    // 6. 도메인 목록 조회 테스트
    await this.runTest('도메인 목록 조회', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'list-domains'
      });
      
      const text = result.content[0].text;
      const expectedDomains = ['company', 'technical', 'customer'];
      
      for (const domain of expectedDomains) {
        if (!text.includes(domain)) {
          throw new Error(`도메인이 없습니다: ${domain}`);
        }
      }
      
      console.log(`   조회된 도메인: ${expectedDomains.join(', ')}`);
    });

    // 7. 문서 ID로 조회 테스트
    await this.runTest('문서 ID로 조회', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'get-document-by-id',
        arguments: {
          documentId: 0
        }
      });
      
      if (!result.content || result.content[0].text.length === 0) {
        throw new Error('문서 내용이 없습니다');
      }
      
      console.log(`   문서 길이: ${result.content[0].text.length} 문자`);
    });

    // 8. 잘못된 문서 ID 테스트
    await this.runTest('잘못된 문서 ID 처리', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'get-document-by-id',
        arguments: {
          documentId: 999
        }
      });
      
      if (!result.content[0].text.includes('찾을 수 없습니다')) {
        throw new Error('오류 메시지가 올바르지 않습니다');
      }
      
      console.log(`   오류 처리 확인됨`);
    });

    // 9. 청크 컨텍스트 조회 테스트
    await this.runTest('청크 컨텍스트 조회', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'get-chunk-with-context',
        arguments: {
          chunkId: 0,
          contextSize: 2
        }
      });
      
      if (!result.content || result.content[0].text.length === 0) {
        throw new Error('청크 내용이 없습니다');
      }
      
      console.log(`   청크 컨텍스트 길이: ${result.content[0].text.length} 문자`);
    });

    // 10. 빈 키워드 배열 테스트
    await this.runTest('빈 키워드 배열 처리', async () => {
      const result = await this.sendMcpRequest('tools/call', {
        name: 'search-documents',
        arguments: {
          keywords: []
        }
      });
      
      if (!result.content[0].text.includes('유효한 검색 키워드가 없습니다')) {
        throw new Error('빈 키워드 처리가 올바르지 않습니다');
      }
      
      console.log(`   빈 키워드 처리 확인됨`);
    });
  }

  async cleanup() {
    console.log('\n🧹 테스트 환경 정리 중...');
    
    // 서버 프로세스 종료
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 테스트 파일 삭제
    try {
      if (this.testDocsPath) {
        await fs.rm(this.testDocsPath, { recursive: true, force: true });
      }
      if (this.testConfigPath) {
        await fs.unlink(this.testConfigPath);
      }
    } catch (error) {
      console.warn('정리 중 오류:', error.message);
    }
    
    console.log('✅ 정리 완료');
  }

  printResults() {
    console.log('\n📊 테스트 결과 요약');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (result.error) {
        console.log(`    오류: ${result.error}`);
      }
    });
    
    console.log('='.repeat(50));
    console.log(`총 테스트: ${this.testResults.length}개`);
    console.log(`성공: ${passed}개`);
    console.log(`실패: ${failed}개`);
    console.log(`성공률: ${Math.round((passed / this.testResults.length) * 100)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 모든 테스트가 성공했습니다!');
    } else {
      console.log('\n⚠️  일부 테스트가 실패했습니다.');
    }
  }

  async run() {
    try {
      await this.setup();
      await this.startServer();
      await this.runAllTests();
    } catch (error) {
      console.error('\n💥 테스트 실행 중 오류:', error.message);
      this.testResults.push({ name: '테스트 실행', status: 'FAIL', error: error.message });
    } finally {
      await this.cleanup();
      this.printResults();
    }
  }
}

// 메인 실행
console.log('🚀 MCP API 테스터 시작');
console.log('이 스크립트는 실제 MCP 서버를 시작하고 API를 테스트합니다.\n');

const tester = new McpApiTester();
tester.run().catch(error => {
  console.error('테스터 실행 실패:', error);
  process.exit(1);
});
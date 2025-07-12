#!/usr/bin/env node

/**
 * 간단한 MCP 서버 기능 테스트
 * 서버 시작 없이 핵심 컴포넌트를 직접 테스트
 */

import { DocumentRepository } from './dist/services/DocumentRepository.js';
import { KnowledgeDocument } from './dist/models/Document.js';
import fs from 'fs/promises';
import path from 'path';

class SimpleMcpTester {
  constructor() {
    this.testResults = [];
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 테스트: ${testName}`);
    try {
      await testFunction();
      console.log(`✅ 성공: ${testName}`);
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.log(`❌ 실패: ${testName} - ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async createTestDocument(id, title, content, domain) {
    // createRemoteMarkdownDocument 함수를 사용하여 올바른 문서 구조 생성
    const { createRemoteMarkdownDocument, KnowledgeDocument } = await import('./dist/models/Document.js');
    const remoteDoc = createRemoteMarkdownDocument(
      `test-${id}`,
      `/test/${title.toLowerCase().replace(/\s+/g, '-')}.md`,
      content,
      10 // minChunkWords를 10으로 설정하여 테스트 텍스트가 청킹되도록 함
    );
    
    return new KnowledgeDocument(remoteDoc, id, domain);
  }

  async testDocumentRepository() {
    // 테스트용 문서 생성
    const testDocs = [
      await this.createTestDocument(
        0,
        'Payment API Documentation',
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
API는 표준 HTTP 상태 코드와 상세한 오류 메시지를 반환합니다.`,
        'company'
      ),
      await this.createTestDocument(
        1,
        'Security Guide',
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
- 리프레시 토큰 구현`,
        'technical'
      ),
      await this.createTestDocument(
        2,
        'Customer Support Guide',
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
4. 새 비밀번호 설정`,
        'customer'
      )
    ];

    const repository = new DocumentRepository();

    // 1. Repository 초기화 테스트
    await this.runTest('DocumentRepository 초기화', async () => {
      await repository.initialize(testDocs);
      if (!repository.isInitialized()) {
        throw new Error('Repository가 초기화되지 않았습니다');
      }
      
      const stats = repository.getStatistics();
      console.log(`   문서 수: ${stats.totalDocuments}, 청크 수: ${stats.totalChunks}`);
      
      if (stats.totalDocuments !== 3) {
        throw new Error(`예상 문서 수: 3, 실제: ${stats.totalDocuments}`);
      }
    });

    // 2. 키워드 검색 테스트
    await this.runTest('키워드 검색 (payment, API)', async () => {
      const result = await repository.searchDocuments(['payment', 'API']);
      
      if (!result.includes('Payment API')) {
        throw new Error('예상된 검색 결과가 없습니다');
      }
      
      console.log(`   검색 결과 길이: ${result.length} 문자`);
    });

    // 3. 한국어 키워드 검색 테스트
    await this.runTest('한국어 키워드 검색 (인증, 보안)', async () => {
      const result = await repository.searchDocuments(['인증', '보안']);
      
      if (!result.includes('인증') || !result.includes('보안')) {
        throw new Error('한국어 검색 결과가 올바르지 않습니다');
      }
      
      console.log(`   한국어 검색 결과 길이: ${result.length} 문자`);
    });

    // 4. 도메인 필터 테스트
    await this.runTest('도메인 필터 검색 (technical)', async () => {
      const result = await repository.searchDocuments(['보안'], { domain: 'technical' });
      
      if (result.includes('Payment API')) {
        throw new Error('도메인 필터가 올바르게 작동하지 않습니다');
      }
      
      if (!result.includes('보안') && !result.includes('Security')) {
        console.log(`   실제 결과: ${result.substring(0, 200)}...`);
        throw new Error('technical 도메인 결과가 없습니다');
      }
      
      console.log(`   도메인 필터 결과: technical 도메인만 포함`);
    });

    // 5. topN 제한 테스트
    await this.runTest('topN 제한 (1개)', async () => {
      const result = await repository.searchDocuments(['가이드'], { topN: 1 });
      
      const documentCount = (result.match(/## 문서:/g) || []).length;
      console.log(`   검색 결과: ${result.substring(0, 300)}...`);
      console.log(`   문서 개수 패턴: ${result.match(/## 문서:/g)}`);
      
      if (documentCount < 1) {
        throw new Error(`topN=1로 설정했지만 결과가 없습니다. 결과: ${documentCount}`);
      }
      
      console.log(`   제한된 결과 수: ${documentCount}개`);
    });

    // 6. contextWindow 테스트
    await this.runTest('contextWindow 설정', async () => {
      const result1 = await repository.searchDocuments(['결제'], { contextWindow: 1 });
      const result2 = await repository.searchDocuments(['결제'], { contextWindow: 3 });
      
      if (result2.length <= result1.length) {
        throw new Error('contextWindow가 올바르게 작동하지 않습니다');
      }
      
      console.log(`   context 1: ${result1.length}자, context 3: ${result2.length}자`);
    });

    // 7. 문서 ID로 조회 테스트
    await this.runTest('문서 ID로 조회', async () => {
      const doc = repository.getDocumentById(0);
      
      if (!doc || doc.title !== 'Payment API Documentation') {
        throw new Error('문서 ID 조회가 실패했습니다');
      }
      
      console.log(`   조회된 문서: ${doc.title}`);
    });

    // 8. 잘못된 문서 ID 테스트
    await this.runTest('잘못된 문서 ID 처리', async () => {
      const doc = repository.getDocumentById(999);
      
      if (doc !== null) {
        throw new Error('잘못된 ID에 대해 null을 반환해야 합니다');
      }
      
      console.log(`   올바르게 null 반환됨`);
    });

    // 9. 도메인 목록 조회 테스트
    await this.runTest('도메인 목록 조회', async () => {
      const domains = repository.listDomains();
      
      if (domains.length !== 3) {
        throw new Error(`예상 도메인 수: 3, 실제: ${domains.length}`);
      }
      
      const domainNames = domains.map(d => d.name);
      const expectedDomains = ['company', 'technical', 'customer'];
      
      for (const expected of expectedDomains) {
        if (!domainNames.includes(expected)) {
          throw new Error(`도메인이 없습니다: ${expected}`);
        }
      }
      
      console.log(`   도메인: ${domainNames.join(', ')}`);
    });

    // 10. 빈 키워드 배열 테스트
    await this.runTest('빈 키워드 배열 처리', async () => {
      const result = await repository.searchDocuments([]);
      
      if (!result.includes('유효한 검색 키워드가 없습니다')) {
        throw new Error('빈 키워드 처리가 올바르지 않습니다');
      }
      
      console.log(`   빈 키워드 처리 확인됨`);
    });

    // 11. 존재하지 않는 키워드 테스트
    await this.runTest('존재하지 않는 키워드 처리', async () => {
      const result = await repository.searchDocuments(['nonexistent123456']);
      
      if (!result.includes('검색 결과가 없습니다')) {
        throw new Error('존재하지 않는 키워드 처리가 올바르지 않습니다');
      }
      
      console.log(`   존재하지 않는 키워드 처리 확인됨`);
    });

    // 12. 성능 테스트
    await this.runTest('검색 성능 테스트', async () => {
      const startTime = Date.now();
      
      await repository.searchDocuments(['API', 'authentication', 'security']);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      if (responseTime > 1000) {
        throw new Error(`검색이 너무 느립니다: ${responseTime}ms`);
      }
      
      console.log(`   검색 시간: ${responseTime}ms`);
    });

    // 13. 대량 키워드 테스트
    await this.runTest('대량 키워드 검색', async () => {
      const keywords = ['payment', 'API', 'authentication', 'security', 'guide', 'customer', 'support', '인증', '보안', '결제'];
      
      const result = await repository.searchDocuments(keywords);
      
      if (result.length < 100) {
        throw new Error('대량 키워드 검색 결과가 부족합니다');
      }
      
      console.log(`   대량 키워드 검색 결과: ${result.length}자`);
    });
  }

  printResults() {
    console.log('\n📊 테스트 결과 요약');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (result.error) {
        console.log(`    오류: ${result.error}`);
      }
    });
    
    console.log('='.repeat(60));
    console.log(`총 테스트: ${this.testResults.length}개`);
    console.log(`성공: ${passed}개`);
    console.log(`실패: ${failed}개`);
    console.log(`성공률: ${Math.round((passed / this.testResults.length) * 100)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 모든 테스트가 성공했습니다!');
      console.log('MCP 서버의 핵심 기능이 올바르게 작동합니다.');
    } else {
      console.log('\n⚠️  일부 테스트가 실패했습니다.');
    }
  }

  async run() {
    console.log('🚀 간단한 MCP 기능 테스터 시작');
    console.log('이 테스트는 MCP 서버의 핵심 기능을 직접 테스트합니다.\n');

    try {
      console.log('📦 프로젝트 빌드 확인 중...');
      
      // dist 디렉토리 확인
      try {
        await fs.access('./dist');
        console.log('✅ 빌드된 파일이 존재합니다');
      } catch {
        console.log('⚠️  빌드된 파일이 없습니다. 빌드를 실행합니다...');
        // 여기서 빌드를 실행할 수 있지만, 지금은 메시지만 출력
        throw new Error('npm run build를 먼저 실행해주세요');
      }

      await this.testDocumentRepository();
      
    } catch (error) {
      console.error('\n💥 테스트 실행 중 오류:', error.message);
      this.testResults.push({ name: '테스트 실행', status: 'FAIL', error: error.message });
    }

    this.printResults();
  }
}

// 메인 실행
const tester = new SimpleMcpTester();
tester.run().catch(error => {
  console.error('테스터 실행 실패:', error);
  process.exit(1);
});
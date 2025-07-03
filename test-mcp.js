#!/usr/bin/env node

/**
 * MCP 서버 직접 테스트 스크립트
 */

import { DocumentLoader } from './dist/services/DocumentLoader.js';
import { DocumentRepository } from './dist/services/DocumentRepository.js';
import { loadConfig } from './dist/config/config.js';

async function testMCP() {
  try {
    // 설정 로드
    const config = await loadConfig();
    console.log('✓ 설정 로드 성공');
    
    // 문서 로드
    const loader = new DocumentLoader(config.documentSource);
    const documents = await loader.loadAllDocuments();
    console.log(`✓ 문서 로드 성공: ${documents.length}개`);
    
    // 저장소 초기화
    const repository = new DocumentRepository(documents);
    const stats = repository.getStatistics();
    console.log(`✓ 저장소 초기화 성공: ${stats.totalChunks}개 청크`);
    
    // 도메인 목록 조회
    const domains = repository.listDomains();
    console.log('✓ 도메인 목록:');
    domains.forEach(d => console.log(`  - ${d.name}: ${d.documentCount}개 문서`));
    
    // 테크솔루션즈 검색 테스트
    console.log('\n🔍 테크솔루션즈 검색 테스트:');
    const searchResults = await repository.searchDocuments(['테크솔루션즈']);
    console.log(searchResults);
    
    // 설립 관련 검색 테스트
    console.log('\n🔍 설립 관련 검색 테스트:');
    const establishmentResults = await repository.searchDocuments(['설립', '2020']);
    console.log(establishmentResults);
    
    // 회사 도메인 검색 테스트
    console.log('\n🔍 회사 도메인 검색 테스트:');
    const companyResults = await repository.searchDocuments(['테크솔루션즈', '설립'], { domain: 'company' });
    console.log(companyResults);
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  }
}

testMCP();
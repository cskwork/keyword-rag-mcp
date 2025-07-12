#!/usr/bin/env node

import { Command } from 'commander';
// Removed unused imports
import { loadConfig } from './config/config.js';
import { DocumentLoader } from './services/DocumentLoader.js';
import { DocumentRepository } from './services/DocumentRepository.js';

const program = new Command();

/**
 * 간소화된 CLI 도구
 * 필수 기능만 제공: setup, search, serve
 */

program
  .name('mcp-knowledge-cli')
  .description('Simple CLI for MCP knowledge retrieval system')
  .version('1.0.0');

/**
 * 시스템 설정 및 문서 인덱싱 (index, discover, validate 통합)
 */
program
  .command('setup')
  .description('Setup system and index documents (replaces index, discover, validate)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log('🚀 시스템 설정 및 문서 인덱싱을 시작합니다...\n');
      
      // 설정 로드 (자동으로 config.json 생성)
      const config = await loadConfig();
      console.log(`📂 문서 경로: ${config.documentSource.basePath}`);
      console.log(`📁 발견된 도메인: ${config.documentSource.domains.length}개`);
      
      if (options.verbose) {
        config.documentSource.domains.forEach((domain: any) => {
          console.log(`  - ${domain.name} (${domain.category})`);
        });
      }
      console.log();

      // 문서 로드
      const loader = new DocumentLoader(config.documentSource);
      const documents = await loader.loadAllDocuments();
      
      console.log(`📄 로드된 문서: ${documents.length}개`);

      // 저장소 초기화
      const repository = new DocumentRepository();
      await repository.initialize(documents);
      
      const stats = repository.getStatistics();
      console.log(`✅ 인덱싱 완료!`);
      console.log(`  - 문서: ${stats.totalDocuments}개`);
      console.log(`  - 청크: ${stats.totalChunks}개`);
      console.log(`  - 도메인: ${stats.domains.length}개`);
      
      console.log('\n🎉 시스템 준비 완료! 이제 `serve` 명령으로 서버를 시작하세요.');
      
    } catch (error) {
      console.error('❌ 설정 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 검색 테스트
 */
program
  .command('search <keywords...>')
  .description('Search documents (testing)')
  .option('-d, --domain <domain>', 'Search within specific domain')
  .option('-n, --limit <number>', 'Maximum results', '5')
  .action(async (keywords, options) => {
    try {
      console.log(`🔍 검색: "${keywords.join(' ')}"\n`);
      
      const config = await loadConfig();
      const loader = new DocumentLoader(config.documentSource);
      const documents = await loader.loadAllDocuments();
      
      const repository = new DocumentRepository();
      await repository.initialize(documents);
      
      const results = await repository.searchDocuments(keywords, {
        domain: options.domain,
        topN: parseInt(options.limit)
      });
      
      const parsedResults = JSON.parse(results || '[]');
      
      if (parsedResults.length === 0) {
        console.log('📭 검색 결과가 없습니다.');
        return;
      }
      
      console.log(`📋 검색 결과 (${parsedResults.length}개):\n`);
      parsedResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. [${result.domainName}] ${result.title}`);
        console.log(`   Score: ${result.score.toFixed(3)}`);
        console.log(`   ${result.text.substring(0, 150)}...`);
        console.log();
      });
      
    } catch (error) {
      console.error('❌ 검색 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * MCP 서버 시작
 */
program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --port <port>', 'Server port (for future use)')
  .action(async (_options) => {
    try {
      console.log('🌐 MCP 서버를 시작합니다...');
      
      // MCP 서버 시작
      const { McpServer } = await import('./server/McpServer.js');
      const server = new McpServer();
      await server.start();
      
    } catch (error) {
      console.error('❌ 서버 시작 실패:', (error as Error).message);
      process.exit(1);
    }
  });

// CLI 실행
program.parse();
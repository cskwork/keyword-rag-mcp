#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config/config.js';
import { DocumentLoader } from './services/DocumentLoader.js';
import { DocumentRepository } from './services/DocumentRepository.js';
import { AnalyticsService } from './services/AnalyticsService.js';
import { ValidationService } from './services/ValidationService.js';
import { DomainDiscoveryService } from './services/DomainDiscoveryService.js';
import { CategoryMappingService } from './services/CategoryMappingService.js';

const program = new Command();

/**
 * CLI 도구
 * 문서 관리, 인덱싱, 검색 테스트 등의 기능 제공
 */

program
  .name('mcp-knowledge-cli')
  .description('CLI tool for managing MCP knowledge retrieval system')
  .version('1.0.0');

/**
 * 문서 인덱싱 명령
 */
program
  .command('index')
  .description('Index all documents in the configured domains')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log('🔍 문서 인덱싱을 시작합니다...\n');
      
      const config = await loadConfig();
      console.log(`📂 기본 경로: ${config.documentSource.basePath}`);
      console.log(`📁 도메인 수: ${config.documentSource.domains.length}\n`);

      // 문서 로드
      const loader = new DocumentLoader(config.documentSource);
      const documents = await loader.loadAllDocuments();
      
      console.log(`📄 로드된 문서: ${documents.length}개`);

      // 저장소 초기화
      const repository = new DocumentRepository();
      await repository.initialize(documents);

      const stats = repository.getStatistics();
      console.log(`\n✅ 인덱싱 완료:`);
      console.log(`   - 총 문서: ${stats.totalDocuments}개`);
      console.log(`   - 총 청크: ${stats.totalChunks}개`);
      console.log(`   - 도메인별 분포:`);
      
      stats.domains.forEach((domain: any) => {
        console.log(`     • ${domain.name}: ${domain.documentCount}개 문서`);
      });

    } catch (error) {
      console.error('❌ 인덱싱 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 검색 테스트 명령
 */
program
  .command('search')
  .description('Test search functionality')
  .argument('<keywords...>', 'Keywords to search for')
  .option('-d, --domain <domain>', 'Domain to search in')
  .option('-n, --top <number>', 'Number of results to return', '5')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .action(async (keywords, options) => {
    try {
      console.log(`🔍 검색어: ${keywords.join(', ')}`);
      if (options.domain) {
        console.log(`📁 도메인: ${options.domain}`);
      }
      console.log('');

      const config = await loadConfig();
      const loader = new DocumentLoader(config.documentSource);
      const documents = await loader.loadAllDocuments();
      
      const repository = new DocumentRepository();
      await repository.initialize(documents);

      const startTime = Date.now();
      const results = await repository.searchDocuments(keywords, {
        domain: options.domain,
        topN: parseInt(options.top),
        contextWindow: config.chunk.contextWindowSize
      });
      const searchTime = Date.now() - startTime;

      console.log(`⏱️  검색 시간: ${searchTime}ms\n`);
      console.log('📊 검색 결과:\n');
      console.log(results);

    } catch (error) {
      console.error('❌ 검색 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 도메인 탐지 명령
 */
program
  .command('discover')
  .description('Discover domains in the document directory')
  .option('-p, --path <path>', 'Path to discover domains in', './docs')
  .option('-c, --create-config', 'Create configuration file with discovered domains')
  .action(async (options) => {
    try {
      console.log(`🔍 도메인 탐지 중: ${options.path}\n`);

      const categoryService = new CategoryMappingService();
      const discoveryService = new DomainDiscoveryService(categoryService);
      
      const domains = await discoveryService.discoverDomains(options.path);
      const stats = discoveryService.getDiscoveryStats(domains);

      console.log(`✅ 탐지 완료:`);
      console.log(`   - 발견된 도메인: ${stats.totalDomains}개`);
      console.log(`   - 카테고리화된 도메인: ${stats.categorizedDomains}개`);
      console.log(`   - 카테고리 없는 도메인: ${stats.uncategorizedDomains}개\n`);

      console.log('📁 발견된 도메인:');
      domains.forEach((domain, index) => {
        console.log(`   ${index + 1}. ${domain.name} (${domain.category || '카테고리 없음'})`);
        console.log(`      경로: ${domain.path}`);
      });

      if (options.createConfig && domains.length > 0) {
        const configPath = './config.json';
        const configTemplate = {
          serverName: 'knowledge-retrieval',
          serverVersion: '1.0.0',
          documentSource: {
            type: 'local',
            basePath: options.path,
            autoDiscovery: true,
            domains: domains
          },
          bm25: {
            k1: 1.2,
            b: 0.75
          },
          chunk: {
            minWords: 30,
            contextWindowSize: 1
          },
          logLevel: 'info'
        };

        fs.writeFileSync(configPath, JSON.stringify(configTemplate, null, 2));
        console.log(`\n✅ 설정 파일 생성됨: ${configPath}`);
      }

    } catch (error) {
      console.error('❌ 도메인 탐지 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 통계 명령
 */
program
  .command('stats')
  .description('Show system statistics and analytics')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .option('--hours <number>', 'Time range in hours for analytics', '24')
  .action(async (options) => {
    try {
      console.log('📊 시스템 통계 수집 중...\n');

      const config = await loadConfig();
      const loader = new DocumentLoader(config.documentSource);
      const documents = await loader.loadAllDocuments();
      
      const repository = new DocumentRepository();
      await repository.initialize(documents);

      const repoStats = repository.getStatistics();
      
      console.log('🗃️  저장소 통계:');
      console.log(`   - 총 문서: ${repoStats.totalDocuments}개`);
      console.log(`   - 총 청크: ${repoStats.totalChunks}개`);
      console.log(`   - 평균 청크/문서: ${(repoStats.totalChunks / repoStats.totalDocuments).toFixed(1)}개\n`);

      console.log('📁 도메인별 분포:');
      repoStats.domains.forEach((domain: any) => {
        console.log(`   • ${domain.name}: ${domain.documentCount}개 문서`);
      });

      // 분석 서비스 통계 (존재하는 경우)
      try {
        const analyticsService = new AnalyticsService();
        const analytics = await analyticsService.getSearchAnalytics(parseInt(options.hours));
        
        if (analytics.totalQueries > 0) {
          console.log(`\n🔍 검색 분석 (최근 ${options.hours}시간):`);
          console.log(`   - 총 검색: ${analytics.totalQueries}회`);
          console.log(`   - 평균 응답시간: ${analytics.avgResponseTime}ms`);
          console.log(`   - 캐시 적중률: ${(analytics.cacheHitRate * 100).toFixed(1)}%\n`);

          if (analytics.topKeywords.length > 0) {
            console.log('🔥 인기 키워드:');
            analytics.topKeywords.slice(0, 5).forEach((kw, index) => {
              console.log(`   ${index + 1}. ${kw.keyword} (${kw.count}회)`);
            });
          }
        } else {
          console.log(`\n🔍 검색 분석: 최근 ${options.hours}시간 동안 검색 기록이 없습니다.`);
        }
      } catch (error) {
        console.log('\n📊 분석 데이터를 불러올 수 없습니다.');
      }

    } catch (error) {
      console.error('❌ 통계 수집 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 설정 검증 명령
 */
program
  .command('validate')
  .description('Validate configuration and system health')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .action(async (options) => {
    try {
      console.log('🔍 설정 및 시스템 검증 중...\n');

      const config = await loadConfig();
      const validationService = new ValidationService();

      // 설정 검증
      const configValidation = validationService.validateConfig(config);
      
      console.log('⚙️  설정 검증:');
      if (configValidation.isValid) {
        console.log('   ✅ 설정이 유효합니다.');
      } else {
        console.log('   ❌ 설정에 문제가 있습니다:');
        configValidation.errors.forEach(error => {
          console.log(`      - ${error}`);
        });
      }

      if (configValidation.warnings.length > 0) {
        console.log('   ⚠️  경고:');
        configValidation.warnings.forEach(warning => {
          console.log(`      - ${warning}`);
        });
      }

      // 건강 상태 검사
      console.log('\n🏥 시스템 건강 상태 검사:');
      const healthCheck = await validationService.performHealthCheck(config);
      
      for (const [checkName, result] of Object.entries(healthCheck.checks)) {
        const statusIcon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`   ${statusIcon} ${checkName}: ${result.message}`);
      }

      console.log(`\n📋 전체 상태: ${healthCheck.status.toUpperCase()}`);

    } catch (error) {
      console.error('❌ 검증 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 서버 시작 명령
 */
program
  .command('serve')
  .description('Start the MCP server')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .option('-d, --dev', 'Development mode with hot reload')
  .action(async (options) => {
    try {
      console.log('🚀 MCP 서버 시작 중...\n');

      if (options.dev) {
        process.env.NODE_ENV = 'development';
        console.log('🔥 개발 모드 (Hot Reload 활성화)');
      }

      // 메인 서버 모듈 동적 임포트
      const serverModule = await import('./index.js');
      console.log('✅ 서버가 시작되었습니다.');
      
    } catch (error) {
      console.error('❌ 서버 시작 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 문서 추가 명령
 */
program
  .command('add-doc')
  .description('Add a new document to a domain')
  .argument('<domain>', 'Domain name')
  .argument('<file>', 'Path to the markdown file')
  .option('-c, --config <path>', 'Configuration file path', './config.json')
  .option('--copy', 'Copy file to domain directory')
  .action(async (domain, file, options) => {
    try {
      console.log(`📄 문서 추가: ${file} → ${domain} 도메인\n`);

      const config = await loadConfig();
      
      // 도메인 존재 확인
      const targetDomain = config.documentSource.domains.find((d: any) => d.name === domain);
      if (!targetDomain) {
        throw new Error(`도메인 '${domain}'을 찾을 수 없습니다.`);
      }

      // 파일 존재 확인
      if (!fs.existsSync(file)) {
        throw new Error(`파일을 찾을 수 없습니다: ${file}`);
      }

      const domainPath = path.join(config.documentSource.basePath, targetDomain.path);
      
      // 도메인 디렉토리 생성
      if (!fs.existsSync(domainPath)) {
        fs.mkdirSync(domainPath, { recursive: true });
        console.log(`📁 도메인 디렉토리 생성: ${domainPath}`);
      }

      if (options.copy) {
        // 파일 복사
        const fileName = path.basename(file);
        const targetPath = path.join(domainPath, fileName);
        
        fs.copyFileSync(file, targetPath);
        console.log(`✅ 파일 복사됨: ${targetPath}`);
      } else {
        // 심볼릭 링크 생성 (Unix 시스템에서만)
        const fileName = path.basename(file);
        const targetPath = path.join(domainPath, fileName);
        const absoluteSourcePath = path.resolve(file);
        
        try {
          fs.symlinkSync(absoluteSourcePath, targetPath);
          console.log(`✅ 심볼릭 링크 생성: ${targetPath} → ${absoluteSourcePath}`);
        } catch (error) {
          // 심볼릭 링크 실패시 복사로 대체
          fs.copyFileSync(file, targetPath);
          console.log(`✅ 파일 복사됨: ${targetPath}`);
        }
      }

      console.log('\n📝 문서가 성공적으로 추가되었습니다.');
      console.log('   다음번 서버 재시작 시 인덱싱됩니다.');

    } catch (error) {
      console.error('❌ 문서 추가 실패:', (error as Error).message);
      process.exit(1);
    }
  });

/**
 * 도움말 명령
 */
program
  .command('help-extended')
  .description('Show extended help with examples')
  .action(() => {
    console.log(`
🛠️  MCP Knowledge Retrieval CLI Tool

📚 주요 명령어 예시:

1. 문서 인덱싱:
   mcp-knowledge-cli index

2. 검색 테스트:
   mcp-knowledge-cli search "API 인증" "JWT" -d technical -n 3

3. 도메인 자동 탐지:
   mcp-knowledge-cli discover -p ./docs --create-config

4. 시스템 통계:
   mcp-knowledge-cli stats --hours 48

5. 설정 검증:
   mcp-knowledge-cli validate

6. 서버 시작:
   mcp-knowledge-cli serve --dev

7. 문서 추가:
   mcp-knowledge-cli add-doc technical README.md --copy

📋 환경 변수:
   - MCP_SERVER_NAME: 서버 이름
   - DOCS_BASE_PATH: 기본 문서 경로
   - BM25_K1, BM25_B: BM25 매개변수
   - LOG_LEVEL: 로그 레벨

📖 자세한 정보는 CLAUDE.md 파일을 참조하세요.
`);
  });

// 명령어 파싱 및 실행
program.parse();
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/config.js';
import { DocumentLoader } from './services/DocumentLoader.js';
import { DocumentRepository } from './services/DocumentRepository.js';
import { FileWatcherService, FileChangeEvent } from './services/FileWatcherService.js';
import { CacheService, createSearchCacheKey } from './services/CacheService.js';
import { ValidationService } from './services/ValidationService.js';
import { AnalyticsService } from './services/AnalyticsService.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 전역 변수
let repository: DocumentRepository | null = null;
let config: any = null;
let isInitialized = false;
let isInitializing = false;
let fileWatcher: FileWatcherService | null = null;
let searchCache: CacheService<any> | null = null;
let validationService: ValidationService | null = null;
let analyticsService: AnalyticsService | null = null;

console.error(`[DEBUG] Module loaded at ${new Date().toISOString()}`);

// PID 파일 경로
const PID_FILE = path.join(os.tmpdir(), 'mcp-knowledge-retrieval.pid');

/**
 * 프로세스 잠금 확인 및 설정
 */
function checkAndSetProcessLock(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const existingPid = fs.readFileSync(PID_FILE, 'utf8').trim();
      
      // 기존 프로세스가 실행 중인지 확인
      try {
        process.kill(parseInt(existingPid), 0); // 시그널 0으로 프로세스 존재 확인
        console.error(`[ERROR] MCP server already running with PID ${existingPid}`);
        console.error(`[ERROR] Kill existing process first: kill ${existingPid}`);
        process.exit(1);
      } catch (e) {
        // 프로세스가 존재하지 않으면 PID 파일 제거
        console.error(`[DEBUG] Stale PID file found, removing...`);
        fs.unlinkSync(PID_FILE);
      }
    }
    
    // 현재 프로세스 PID 저장
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.error(`[DEBUG] Process lock acquired, PID: ${process.pid}`);
    
    // 프로세스 종료 시 PID 파일 정리
    process.on('exit', () => {
      try {
        if (fs.existsSync(PID_FILE)) {
          fs.unlinkSync(PID_FILE);
        }
      } catch (e) {
        // 무시
      }
    });
    
    process.on('SIGINT', () => {
      console.error(`[DEBUG] Received SIGINT, cleaning up...`);
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.error(`[DEBUG] Received SIGTERM, cleaning up...`);
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`[ERROR] Failed to set process lock: ${error}`);
    process.exit(1);
  }
}

/**
 * MCP 서버 초기화
 */
async function initializeServer() {
  console.error(`[DEBUG] initializeServer() started, isInitialized=${isInitialized}, isInitializing=${isInitializing}`);
  
  if (isInitialized && repository?.isInitialized()) {
    console.error(`[DEBUG] Already initialized, skipping. Repository has ${repository.getStatistics().totalDocuments} documents`);
    return;
  }
  
  if (isInitializing) {
    console.error(`[DEBUG] Already initializing, waiting...`);
    // 초기화 완료까지 대기
    while (isInitializing && !isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }
  
  try {
    isInitializing = true;
    
    // 설정 로드
    console.error(`[DEBUG] Loading config...`);
    config = await loadConfig();
    console.error(`[DEBUG] Config loaded`);
    console.error(`[DEBUG] config.documentSource.basePath=${config.documentSource.basePath}`);
    console.error(`[DEBUG] config.documentSource.domains length=${config.documentSource.domains.length}`);
    config.documentSource.domains.forEach((d: {name: string; path: string; category?: string})=>
      console.error(`[DEBUG] domain-> name:${d.name}, path:${d.path}`)
    );

    // 문서 로드
    console.error(`[DEBUG] Creating DocumentLoader...`);
    const loader = new DocumentLoader(config.documentSource);
    console.error(`[DEBUG] Loading documents...`);
    const documents = await loader.loadAllDocuments();
    console.error(`[DEBUG] Documents loaded: ${documents.length} documents`);

    // 저장소 생성 및 초기화 (기존 repository가 있으면 재사용하지 않고 새로 생성)
    console.error(`[DEBUG] Creating and initializing DocumentRepository...`);
    if (!repository) {
      repository = new DocumentRepository();
    }
    
    // repository가 이미 초기화되어 있다면 재초기화하지 않음
    if (!repository.isInitialized()) {
      await repository.initialize(documents); // 비동기 초기화 대기
    } else {
      console.error(`[DEBUG] Repository already initialized, skipping re-initialization`);
    }
    
    const stats = repository.getStatistics();
    console.error(`[DEBUG] Repository fully initialized`);
    console.error(`[DEBUG] Repository instance: ${repository ? 'EXISTS' : 'NULL'}`);
    console.error(`[DEBUG] Repository stats: ${JSON.stringify(stats)}`);
    
    // 검색 캐시 초기화
    if (!searchCache) {
      searchCache = new CacheService(500); // 최대 500개 검색 결과 캐싱
      console.error(`[DEBUG] Search cache initialized`);
    }
    
    // 검증 서비스 초기화
    if (!validationService) {
      validationService = new ValidationService();
      console.error(`[DEBUG] Validation service initialized`);
    }
    
    // 분석 서비스 초기화
    if (!analyticsService) {
      analyticsService = new AnalyticsService();
      console.error(`[DEBUG] Analytics service initialized`);
    }
    
    // 파일 감시 서비스 시작 (개발 모드에서만)
    if (process.env.NODE_ENV !== 'production' && !fileWatcher) {
      setupFileWatcher();
    }
    
    isInitialized = true;
    console.error(`[DEBUG] initializeServer() completed successfully, isInitialized=${isInitialized}`);
  } catch (error) {
    console.error(`[DEBUG] Error in initializeServer(): ${error}`);
    isInitialized = false;
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * 파일 감시 서비스 설정
 */
function setupFileWatcher(): void {
  if (!config?.documentSource?.basePath) {
    console.error(`[DEBUG] FileWatcher: basePath not available, skipping file watching`);
    return;
  }

  try {
    fileWatcher = new FileWatcherService();
    
    // 파일 변경 이벤트 처리
    fileWatcher.on('fileChange', handleFileChange);
    
    // 에러 처리
    fileWatcher.on('error', (error: Error) => {
      console.error(`[DEBUG] FileWatcher error: ${error.message}`);
    });
    
    // 감시 시작
    fileWatcher.startWatching(config.documentSource.basePath);
    console.error(`[DEBUG] File watching started for: ${config.documentSource.basePath}`);
  } catch (error) {
    console.error(`[DEBUG] Failed to setup file watcher: ${(error as Error).message}`);
  }
}

/**
 * 파일 변경 이벤트 처리
 */
async function handleFileChange(event: FileChangeEvent): Promise<void> {
  try {
    console.error(`[DEBUG] File change detected: ${event.type} - ${event.path}`);
    
    // 검색 캐시 무효화
    if (searchCache) {
      if (event.type === 'addDir' || event.type === 'unlinkDir') {
        // 도메인 변경시 모든 캐시 무효화
        searchCache.clear();
        console.error(`[DEBUG] Cleared all cache due to domain changes`);
      } else {
        // 특정 도메인 관련 캐시만 무효화
        const domain = event.path.split('/')[0];
        const deletedCount = searchCache.deleteByPattern(new RegExp(`search:.*:${domain}:`));
        console.error(`[DEBUG] Invalidated ${deletedCount} cache entries for domain: ${domain}`);
      }
    }
    
    // 디렉토리 변경인 경우 전체 재초기화
    if (event.type === 'addDir' || event.type === 'unlinkDir') {
      console.error(`[DEBUG] Domain structure changed, triggering full reload`);
      await reloadDocuments();
      return;
    }
    
    // 파일 변경인 경우 점진적 업데이트
    if (event.type === 'add' || event.type === 'change') {
      await updateSingleDocument(event.path);
    } else if (event.type === 'unlink') {
      await removeSingleDocument(event.path);
    }
    
  } catch (error) {
    console.error(`[DEBUG] Error handling file change: ${(error as Error).message}`);
  }
}

/**
 * 전체 문서 다시 로드
 */
async function reloadDocuments(): Promise<void> {
  try {
    console.error(`[DEBUG] Starting full document reload...`);
    
    // 기존 상태 리셋
    isInitialized = false;
    
    // 새로운 설정 로드
    config = await loadConfig();
    
    // 문서 다시 로드
    const loader = new DocumentLoader(config.documentSource);
    const documents = await loader.loadAllDocuments();
    
    // Repository 재초기화
    if (repository) {
      await repository.initialize(documents);
    }
    
    isInitialized = true;
    console.error(`[DEBUG] Full document reload completed. Loaded ${documents.length} documents`);
    
  } catch (error) {
    console.error(`[DEBUG] Error during full reload: ${(error as Error).message}`);
    isInitialized = false;
  }
}

/**
 * 단일 문서 업데이트
 */
async function updateSingleDocument(filePath: string): Promise<void> {
  try {
    console.error(`[DEBUG] Updating single document: ${filePath}`);
    
    if (!repository || !config) {
      console.error(`[DEBUG] Repository or config not available, skipping update`);
      return;
    }
    
    // 전체 재로드로 대체 (단순화를 위해)
    await reloadDocuments();
    
  } catch (error) {
    console.error(`[DEBUG] Error updating single document: ${(error as Error).message}`);
  }
}

/**
 * 단일 문서 제거
 */
async function removeSingleDocument(filePath: string): Promise<void> {
  try {
    console.error(`[DEBUG] Removing single document: ${filePath}`);
    
    if (!repository) {
      console.error(`[DEBUG] Repository not available, skipping removal`);
      return;
    }
    
    // 전체 재로드로 대체 (단순화를 위해)
    await reloadDocuments();
    
  } catch (error) {
    console.error(`[DEBUG] Error removing single document: ${(error as Error).message}`);
  }
}

/**
 * 서버가 준비될 때까지 대기
 */
async function ensureServerReady() {
  // 이미 초기화된 경우 기존 repository 사용
  if (isInitialized && repository?.isInitialized()) {
    console.error(`[DEBUG] ensureServerReady: Already initialized, using existing repository with ${repository.getStatistics().totalDocuments} documents`);
    return;
  }
  
  if (!isInitialized && !isInitializing) {
    console.error(`[DEBUG] ensureServerReady: Starting initialization...`);
    await initializeServer();
  } else if (isInitializing) {
    console.error(`[DEBUG] ensureServerReady: Waiting for initialization to complete...`);
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // 초기화 후 상태 검증
  if (!repository || !repository.isInitialized()) {
    throw new Error('Repository initialization failed or corrupted');
  }
}

/**
 * MCP 서버 생성 및 시작
 */
async function main() {
  console.error(`[DEBUG] Starting main() function at ${new Date().toISOString()}`);
  
  // 프로세스 중복 실행 방지
  checkAndSetProcessLock();
  
  // 서버 초기화 (문서 로딩 및 인덱싱 완료까지 대기)
  console.error(`[DEBUG] About to call initializeServer()`);
  await initializeServer();
  console.error(`[DEBUG] initializeServer() completed, repository exists: ${!!repository}`);
  console.error(`[DEBUG] Repository initialized: ${repository?.isInitialized()}`);

  // MCP 서버 생성
  const server = new Server(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 도구 목록 조회 핸들러
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // This is a dummy handler, tools are managed by the client
    if (!config) {
      try {
        await ensureServerReady();
      } catch(e) {
        console.error("Failed to initialize server for ListTools", e);
      }
    }
    const tools: Tool[] = [
        {
          name: 'search-documents',
          description: 'Search documents using BM25 algorithm. Takes keyword arrays and returns relevant document chunks.',
          inputSchema: {
            type: 'object',
            properties: {
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of keywords to search for (e.g., ["payment", "API", "authentication"])'
              },
              domain: {
                type: 'string',
                description: 'Domain to search in (optional, e.g., "company", "customer")'
              },
              topN: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
                default: 10
              }
            },
            required: ['keywords']
          }
        },
        {
          name: 'get-document-by-id',
          description: 'Retrieve full document by ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'Document ID to retrieve'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'list-domains',
          description: 'List all available domains and their document counts.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get-chunk-with-context',
          description: 'Get specific chunk with surrounding context.',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: {
                type: 'number',
                description: 'Document ID'
              },
              chunkId: {
                type: 'number',
                description: 'Chunk ID'
              },
              windowSize: {
                type: 'number',
                description: 'Context window size (default: 1)',
                default: 1
              }
            },
            required: ['documentId', 'chunkId']
          }
        },
        {
          name: 'get-cache-stats',
          description: 'Get search cache statistics and performance metrics',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'health-check',
          description: 'Perform comprehensive system health check',
          inputSchema: {
            type: 'object',
            properties: {
              detailed: {
                type: 'boolean',
                description: 'Include detailed diagnostic information',
                default: false
              }
            },
            required: []
          }
        },
        {
          name: 'get-document-metadata',
          description: 'Get detailed metadata for a specific document including preprocessing results',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'Document ID to retrieve metadata for'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'get-search-analytics',
          description: 'Get comprehensive search analytics and usage metrics',
          inputSchema: {
            type: 'object',
            properties: {
              timeRangeHours: {
                type: 'number',
                description: 'Time range in hours for analytics (default: 24)',
                default: 24
              }
            },
            required: []
          }
        },
        {
          name: 'get-system-metrics',
          description: 'Get current system performance metrics and statistics',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ];
    
    return { tools };
  });

  // 도구 실행 핸들러
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    console.error(`[DEBUG] Tool called: ${name}`);
    console.error(`[DEBUG] Repository state: ${repository ? 'EXISTS' : 'NULL'}`);
    
    // 도구 호출 전에 반드시 서버 준비 상태 확인
    try {
      await ensureServerReady();
    } catch (error) {
      console.error('[FATAL] Server initialization failed during tool call:', error);
      throw new Error('Server is not initialized and failed to recover. Please check logs and restart.');
    }

    // 상태 로깅
    if (repository) {
      console.error(`[DEBUG] Repository instance ID: ${repository.getInstanceId()}`);
      console.error(`[DEBUG] Repository documents count: ${repository.getStatistics().totalDocuments}`);
    }

    // 이 시점에서 repository는 null이 아님을 보장
    if (!repository || !repository.isInitialized()) {
      throw new Error('Repository is not properly initialized');
    }

    switch (name) {
      case 'search-documents': {
        const { keywords, domain, topN } = args as {
          keywords: string[];
          domain?: string;
          topN?: number;
        };

        // 시작 시간 기록
        const startTime = Date.now();

        // 캐시 키 생성
        const cacheKey = createSearchCacheKey(keywords, domain, topN);
        
        // 캐시된 결과 확인
        let results: string;
        let cacheHit = false;
        if (searchCache && searchCache.has(cacheKey)) {
          results = searchCache.get(cacheKey)!;
          cacheHit = true;
          console.error(`[DEBUG] Cache hit for search: ${cacheKey}`);
        } else {
          // 캐시 미스 - 실제 검색 수행
          results = await repository.searchDocuments(keywords, {
            domain,
            topN,
            contextWindow: config.chunk.contextWindowSize
          });
          
          // 결과 캐싱
          if (searchCache) {
            searchCache.set(cacheKey, results);
            console.error(`[DEBUG] Cached search result: ${cacheKey}`);
          }
        }

        // 응답 시간 계산
        const responseTime = Date.now() - startTime;

        // 결과에서 문서 개수 추출 (간단한 방식)
        const resultCount = (results.match(/## Document/g) || []).length;

        // 분석 서비스에 검색 기록
        if (analyticsService) {
          await analyticsService.recordSearchQuery(
            keywords,
            domain,
            topN || 10,
            resultCount,
            responseTime,
            cacheHit
          );
        }

        const content: TextContent[] = [{
          type: 'text',
          text: results
        }];
        
        return { content };
      }

      case 'get-document-by-id': {
        const { id } = args as { id: number };
        const document = repository.getDocumentById(id);

        if (!document) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Document with ID ${id} not found.`
          }];
          
          return { content };
        }

        const content: TextContent[] = [{
          type: 'text',
          text: `# ${document.title}\n\n${document.content}`
        }];
        
        return { content };
      }

      case 'list-domains': {
        console.error(`[DEBUG] list-domains called`);
        const domains = repository.listDomains();
        console.error(`[DEBUG] domains found: ${JSON.stringify(domains)}`);
        
        if (domains.length === 0) {
          const content: TextContent[] = [{
            type: 'text',
            text: `## Available Domains\n\nNo domains found. Check if documents are loaded properly.`
          }];
          return { content };
        }

        const domainList = domains
          .map(d => `- ${d.name}: ${d.documentCount} documents`)
          .join('\n');

        const content: TextContent[] = [{
          type: 'text',
          text: `## Available Domains\n\n${domainList}`
        }];
        
        return { content };
      }

      case 'get-chunk-with-context': {
        const { documentId, chunkId, windowSize } = args as {
          documentId: number;
          chunkId: number;
          windowSize?: number;
        };

        const document = repository.getDocumentById(documentId);
        if (!document) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Document with ID ${documentId} not found.`
          }];
          
          return { content };
        }

        const chunks = document.getChunkWithWindow(chunkId, windowSize || 1);
        if (chunks.length === 0) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Chunk with ID ${chunkId} not found.`
          }];
          
          return { content };
        }

        const content = chunks.map(chunk => chunk.text).join('\n\n---\n\n');
        const textContent: TextContent[] = [{
          type: 'text',
          text: content
        }];
        
        return { content: textContent };
      }

      case 'get-cache-stats': {
        const stats = searchCache ? searchCache.getStats() : null;
        const watcherStatus = fileWatcher ? fileWatcher.getWatchingStatus() : null;
        
        const statsText = stats ? `
## Search Cache Statistics

- **Cache Size**: ${stats.size}/${stats.maxSize} entries
- **Hit Rate**: ${(stats.hitRate * 100).toFixed(1)}% (${stats.hits} hits, ${stats.misses} misses)
- **Oldest Entry**: ${stats.oldestEntry || 'N/A'}
- **Newest Entry**: ${stats.newestEntry || 'N/A'}

## File Watcher Status

- **Active**: ${watcherStatus?.isWatching ? 'Yes' : 'No'}
- **Watched Path**: ${watcherStatus?.watchedPath || 'N/A'}
- **Watched Files**: ${watcherStatus?.watchedFiles || 0}

## Server Status

- **Hot Reload**: ${process.env.NODE_ENV !== 'production' ? 'Enabled' : 'Disabled'}
- **Repository Status**: ${repository?.isInitialized() ? 'Initialized' : 'Not Initialized'}
- **Total Documents**: ${repository?.getStatistics().totalDocuments || 0}
- **Total Chunks**: ${repository?.getStatistics().totalChunks || 0}
        ` : `
## Cache Statistics

Search cache is not initialized.

## Server Status

- **Hot Reload**: ${process.env.NODE_ENV !== 'production' ? 'Enabled' : 'Disabled'}
- **Repository Status**: ${repository?.isInitialized() ? 'Initialized' : 'Not Initialized'}
        `;

        const content: TextContent[] = [{
          type: 'text',
          text: statsText.trim()
        }];
        
        return { content };
      }

      case 'health-check': {
        const { detailed } = args as { detailed?: boolean };
        
        if (!validationService) {
          const content: TextContent[] = [{
            type: 'text',
            text: 'Validation service is not available.'
          }];
          return { content };
        }

        const healthCheck = await validationService.performHealthCheck(config, repository);
        
        let statusText = `# System Health Check\n\n**Status**: ${healthCheck.status.toUpperCase()}\n**Timestamp**: ${healthCheck.timestamp}\n\n`;
        
        // 각 체크 결과 표시
        for (const [checkName, result] of Object.entries(healthCheck.checks)) {
          const statusIcon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
          statusText += `## ${checkName.charAt(0).toUpperCase() + checkName.slice(1)}\n`;
          statusText += `${statusIcon} **${result.status.toUpperCase()}**: ${result.message}\n\n`;
          
          if (detailed && result.details) {
            statusText += `**Details**:\n\`\`\`json\n${JSON.stringify(result.details, null, 2)}\n\`\`\`\n\n`;
          }
        }

        const content: TextContent[] = [{
          type: 'text',
          text: statusText.trim()
        }];
        
        return { content };
      }

      case 'get-document-metadata': {
        const { id } = args as { id: number };
        const document = repository.getDocumentById(id);

        if (!document) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Document with ID ${id} not found.`
          }];
          
          return { content };
        }

        // 기본 메타데이터 수집
        const basicMetadata = {
          id: document.id,
          title: document.title,
          description: document.description,
          keywords: document.keywords,
          domain: document.domainName,
          link: document.link,
          chunkCount: document.getChunks().length,
          totalWords: document.getChunks().reduce((sum, chunk) => sum + chunk.wordCount, 0)
        };

        // @ts-ignore - accessing private metadata for preprocessing info
        const preprocessedMetadata = (document as any).metadata?.preprocessed;

        let metadataText = `# Document Metadata\n\n`;
        metadataText += `**ID**: ${basicMetadata.id}\n`;
        metadataText += `**Title**: ${basicMetadata.title}\n`;
        metadataText += `**Description**: ${basicMetadata.description}\n`;
        metadataText += `**Domain**: ${basicMetadata.domain}\n`;
        metadataText += `**Source**: ${basicMetadata.link}\n`;
        metadataText += `**Chunks**: ${basicMetadata.chunkCount}\n`;
        metadataText += `**Total Words**: ${basicMetadata.totalWords}\n\n`;

        metadataText += `## Keywords\n${basicMetadata.keywords.join(', ')}\n\n`;

        if (preprocessedMetadata) {
          metadataText += `## Preprocessing Results\n\n`;
          metadataText += `**Reading Time**: ${preprocessedMetadata.readingTime} minutes\n`;
          metadataText += `**Complexity**: ${preprocessedMetadata.complexity}\n`;
          metadataText += `**Language**: ${preprocessedMetadata.language || 'Unknown'}\n`;
          metadataText += `**Tags**: ${preprocessedMetadata.tags.join(', ')}\n\n`;

          if (preprocessedMetadata.headings.length > 0) {
            metadataText += `### Document Structure\n`;
            preprocessedMetadata.headings.forEach((heading: any) => {
              const indent = '  '.repeat(heading.level - 1);
              metadataText += `${indent}- ${heading.text}\n`;
            });
            metadataText += '\n';
          }

          if (preprocessedMetadata.codeBlocks.length > 0) {
            metadataText += `### Code Blocks (${preprocessedMetadata.codeBlocks.length})\n`;
            preprocessedMetadata.codeBlocks.forEach((block: any, index: number) => {
              metadataText += `- Block ${index + 1}: ${block.language || 'text'} (${block.lineCount} lines)\n`;
            });
            metadataText += '\n';
          }

          if (preprocessedMetadata.links.length > 0) {
            metadataText += `### Links (${preprocessedMetadata.links.length})\n`;
            const externalLinks = preprocessedMetadata.links.filter((link: any) => link.isExternal);
            const internalLinks = preprocessedMetadata.links.filter((link: any) => !link.isExternal);
            metadataText += `- External: ${externalLinks.length}\n`;
            metadataText += `- Internal: ${internalLinks.length}\n\n`;
          }

          if (preprocessedMetadata.images.length > 0) {
            metadataText += `### Images (${preprocessedMetadata.images.length})\n`;
            preprocessedMetadata.images.forEach((image: any, index: number) => {
              metadataText += `- Image ${index + 1}: ${image.alt || 'No alt text'}\n`;
            });
            metadataText += '\n';
          }

          if (preprocessedMetadata.tables.length > 0) {
            metadataText += `### Tables (${preprocessedMetadata.tables.length})\n`;
            preprocessedMetadata.tables.forEach((table: any, index: number) => {
              metadataText += `- Table ${index + 1}: ${table.columnCount} columns, ${table.rowCount} rows\n`;
            });
            metadataText += '\n';
          }

          if (preprocessedMetadata.createdAt || preprocessedMetadata.updatedAt) {
            metadataText += `### File Information\n`;
            if (preprocessedMetadata.createdAt) {
              metadataText += `**Created**: ${new Date(preprocessedMetadata.createdAt).toLocaleString()}\n`;
            }
            if (preprocessedMetadata.updatedAt) {
              metadataText += `**Modified**: ${new Date(preprocessedMetadata.updatedAt).toLocaleString()}\n`;
            }
          }
        }

        const content: TextContent[] = [{
          type: 'text',
          text: metadataText.trim()
        }];
        
        return { content };
      }

      case 'get-search-analytics': {
        const { timeRangeHours } = args as { timeRangeHours?: number };
        
        if (!analyticsService) {
          const content: TextContent[] = [{
            type: 'text',
            text: 'Analytics service is not available.'
          }];
          return { content };
        }

        const analytics = await analyticsService.getSearchAnalytics(timeRangeHours);
        const userStats = analyticsService.getUserStats(timeRangeHours);

        let analyticsText = `# Search Analytics Report\n\n`;
        analyticsText += `**Time Range**: Last ${timeRangeHours || 24} hours\n`;
        analyticsText += `**Generated**: ${new Date().toLocaleString()}\n\n`;

        // 기본 통계
        analyticsText += `## Overview\n\n`;
        analyticsText += `- **Total Queries**: ${analytics.totalQueries}\n`;
        analyticsText += `- **Average Response Time**: ${analytics.avgResponseTime}ms\n`;
        analyticsText += `- **Cache Hit Rate**: ${(analytics.cacheHitRate * 100).toFixed(1)}%\n`;
        analyticsText += `- **Unique Users**: ${userStats.totalUsers}\n`;
        analyticsText += `- **Avg Queries per User**: ${userStats.avgQueriesPerUser}\n\n`;

        // 인기 키워드
        if (analytics.topKeywords.length > 0) {
          analyticsText += `## Top Keywords\n\n`;
          analytics.topKeywords.slice(0, 10).forEach((kw, index) => {
            analyticsText += `${index + 1}. **${kw.keyword}** (${kw.count} searches)\n`;
          });
          analyticsText += '\n';
        }

        // 도메인별 통계
        if (analytics.topDomains.length > 0) {
          analyticsText += `## Domain Statistics\n\n`;
          analytics.topDomains.forEach(domain => {
            analyticsText += `### ${domain.domain}\n`;
            analyticsText += `- Queries: ${domain.queryCount}\n`;
            analyticsText += `- Avg Response Time: ${domain.avgResponseTime}ms\n`;
            analyticsText += `- Cache Hit Rate: ${(domain.cacheHitRate * 100).toFixed(1)}%\n`;
            if (domain.popularKeywords.length > 0) {
              analyticsText += `- Popular Keywords: ${domain.popularKeywords.map(k => k.keyword).join(', ')}\n`;
            }
            analyticsText += '\n';
          });
        }

        // 시간대별 패턴
        if (analytics.timeBasedStats.some(stat => stat.queryCount > 0)) {
          analyticsText += `## Usage Patterns by Hour\n\n`;
          const peakHours = analytics.timeBasedStats
            .filter(stat => stat.queryCount > 0)
            .sort((a, b) => b.queryCount - a.queryCount)
            .slice(0, 5);
          
          peakHours.forEach(stat => {
            analyticsText += `- **${stat.hour}:00**: ${stat.queryCount} queries (${stat.avgResponseTime}ms avg)\n`;
          });
          analyticsText += '\n';
        }

        // 성능 메트릭
        analyticsText += `## Performance Metrics\n\n`;
        analyticsText += `- **P50 Response Time**: ${analytics.performanceMetrics.p50ResponseTime}ms\n`;
        analyticsText += `- **P90 Response Time**: ${analytics.performanceMetrics.p90ResponseTime}ms\n`;
        analyticsText += `- **P99 Response Time**: ${analytics.performanceMetrics.p99ResponseTime}ms\n\n`;

        // 느린 쿼리
        if (analytics.performanceMetrics.slowestQueries.length > 0) {
          analyticsText += `## Slowest Queries\n\n`;
          analytics.performanceMetrics.slowestQueries.slice(0, 3).forEach((query, index) => {
            analyticsText += `${index + 1}. **${query.keywords.join(', ')}** (${query.responseTime}ms)\n`;
            analyticsText += `   - Domain: ${query.domain || 'All'}\n`;
            analyticsText += `   - Results: ${query.resultCount}\n`;
            analyticsText += `   - Cache Hit: ${query.cacheHit ? 'Yes' : 'No'}\n\n`;
          });
        }

        const content: TextContent[] = [{
          type: 'text',
          text: analyticsText.trim()
        }];
        
        return { content };
      }

      case 'get-system-metrics': {
        if (!analyticsService) {
          const content: TextContent[] = [{
            type: 'text',
            text: 'Analytics service is not available.'
          }];
          return { content };
        }

        const repoStats = repository.getStatistics();
        const cacheStats = searchCache ? searchCache.getStats() : null;
        const systemMetrics = analyticsService.getSystemMetrics(
          repoStats.totalDocuments,
          repoStats.totalChunks,
          cacheStats
        );

        let metricsText = `# System Metrics\n\n`;
        metricsText += `**Timestamp**: ${new Date().toLocaleString()}\n`;
        metricsText += `**Uptime**: ${Math.floor(systemMetrics.uptime / 3600)}h ${Math.floor((systemMetrics.uptime % 3600) / 60)}m\n\n`;

        // 메모리 사용량
        metricsText += `## Memory Usage\n\n`;
        metricsText += `- **Used**: ${systemMetrics.memoryUsage.used} MB\n`;
        metricsText += `- **Total**: ${systemMetrics.memoryUsage.total} MB\n`;
        metricsText += `- **Usage**: ${systemMetrics.memoryUsage.percentage}%\n\n`;

        // 문서 통계
        metricsText += `## Document Repository\n\n`;
        metricsText += `- **Total Documents**: ${systemMetrics.documentStats.totalDocuments}\n`;
        metricsText += `- **Total Chunks**: ${systemMetrics.documentStats.totalChunks}\n`;
        metricsText += `- **Avg Chunks per Document**: ${systemMetrics.documentStats.avgDocumentSize}\n\n`;

        // 캐시 통계
        metricsText += `## Cache Performance\n\n`;
        metricsText += `- **Cache Size**: ${systemMetrics.cacheStats.size} entries\n`;
        metricsText += `- **Hit Rate**: ${(systemMetrics.cacheStats.hitRate * 100).toFixed(1)}%\n`;
        metricsText += `- **Evictions**: ${systemMetrics.cacheStats.evictionCount}\n\n`;

        // 서비스 상태
        metricsText += `## Service Status\n\n`;
        metricsText += `- **Repository**: ${repository?.isInitialized() ? '✅ Initialized' : '❌ Not Initialized'}\n`;
        metricsText += `- **File Watcher**: ${fileWatcher ? '✅ Active' : '❌ Inactive'}\n`;
        metricsText += `- **Search Cache**: ${searchCache ? '✅ Active' : '❌ Inactive'}\n`;
        metricsText += `- **Analytics**: ${analyticsService ? '✅ Active' : '❌ Inactive'}\n`;
        metricsText += `- **Validation**: ${validationService ? '✅ Active' : '❌ Inactive'}\n\n`;

        // 저장된 분석 데이터
        metricsText += `## Analytics Data\n\n`;
        metricsText += `- **Stored Queries**: ${analyticsService.getStoredQueryCount()}\n`;

        const content: TextContent[] = [{
          type: 'text',
          text: metricsText.trim()
        }];
        
        return { content };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // STDIO 전송 설정
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP server started successfully (silent for protocol)
}

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 서버 시작
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 
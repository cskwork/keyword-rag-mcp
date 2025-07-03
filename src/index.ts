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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 전역 변수
let repository: DocumentRepository | null = null;
let config: any = null;
let isInitialized = false;
let isInitializing = false;

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

        const results = await repository.searchDocuments(keywords, {
          domain,
          topN,
          contextWindow: config.chunk.contextWindowSize
        });

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
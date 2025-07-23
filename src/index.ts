#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type Config } from './config/config.js';
import { DocumentLoader, type LoadingResult } from './services/DocumentLoader.js';
import { DocumentRepository } from './services/DocumentRepository.js';
import { DomainManager } from './services/DomainManager.js';
import { LLMClassificationService } from './services/LLMClassificationService.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 전역 변수
let repository: DocumentRepository | null = null;
let domainManager: DomainManager | null = null;
let classificationService: LLMClassificationService | null = null;
let config: Config | null = null;
let isInitialized = false;
let isInitializing = false;

if (process.env.NODE_ENV === 'development') {
  console.error(`[DEBUG] Module loaded at ${new Date().toISOString()}`);
}

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
        if (process.env.NODE_ENV === 'development') {
          console.error(`[DEBUG] Stale PID file found, removing...`);
        }
        fs.unlinkSync(PID_FILE);
      }
    }
    
    // 현재 프로세스 PID 저장
    fs.writeFileSync(PID_FILE, process.pid.toString());
    if (process.env.NODE_ENV === 'development') {
      console.error(`[DEBUG] Process lock acquired, PID: ${process.pid}`);
    }
    
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
      if (process.env.NODE_ENV === 'development') {
        console.error(`[DEBUG] Received SIGINT, cleaning up...`);
      }
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[DEBUG] Received SIGTERM, cleaning up...`);
      }
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`[ERROR] Failed to set process lock: ${error}`);
    process.exit(1);
  }
}

/**
 * MCP 서버 초기화 (새로운 아키텍처)
 */
async function initializeServer() {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[DEBUG] initializeServer() started, isInitialized=${isInitialized}, isInitializing=${isInitializing}`);
  }
  
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
    
    // 1. 설정 로드 (간소화된 .env 기반)
    console.error(`[DEBUG] Loading config from environment...`);
    config = loadConfig();
    console.error(`[DEBUG] Config loaded: basePath=${config.documentSource.basePath}`);
    console.error(`[DEBUG] Classification enabled: ${config.classification.enabled}`);

    // 2. 도메인 매니저 초기화
    console.error(`[DEBUG] Initializing DomainManager...`);
    domainManager = new DomainManager();
    await domainManager.initialize();
    
    const domainStats = domainManager.getStatistics();
    console.error(`[DEBUG] DomainManager initialized: ${domainStats.totalDomains} domains, ${domainStats.totalMappings} mappings`);

    // 3. LLM 분류 서비스 초기화
    console.error(`[DEBUG] Initializing LLMClassificationService...`);
    classificationService = new LLMClassificationService(domainManager);

    // 4. 새로운 DocumentLoader로 문서 로드 및 자동 분류
    console.error(`[DEBUG] Creating DocumentLoader with auto-classification...`);
    const loader = new DocumentLoader(
      config.documentSource,
      domainManager,
      classificationService,
      config.classification.autoClassifyNewDocuments
    );
    
    console.error(`[DEBUG] Loading and classifying all documents...`);
    const loadingResult: LoadingResult = await loader.loadAllDocuments();
    
    console.error(`[DEBUG] Document loading completed:`);
    console.error(`[DEBUG] - Total documents: ${loadingResult.documents.length}`);
    console.error(`[DEBUG] - New domains created: ${loadingResult.newDomains.length}`);
    console.error(`[DEBUG] - Classification stats:`, loadingResult.classificationStats);

    // 5. DocumentRepository 초기화
    console.error(`[DEBUG] Creating and initializing DocumentRepository...`);
    if (!repository) {
      repository = new DocumentRepository();
    }
    
    if (!repository.isInitialized()) {
      await repository.initialize(loadingResult.documents);
    } else {
      console.error(`[DEBUG] Repository already initialized, skipping re-initialization`);
    }
    
    const repoStats = repository.getStatistics();
    console.error(`[DEBUG] Repository fully initialized:`);
    console.error(`[DEBUG] - Total documents: ${repoStats.totalDocuments}`);
    console.error(`[DEBUG] - Total chunks: ${repoStats.totalChunks}`);
    console.error(`[DEBUG] - Total words: ${repoStats.totalWords}`);
    console.error(`[DEBUG] - Domains: ${repoStats.domains.length}`);
    
    isInitialized = true;
    console.error(`[DEBUG] initializeServer() completed successfully`);
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
  if (!repository || !repository.isInitialized() || !domainManager || !classificationService || !config) {
    throw new Error('Server initialization failed or corrupted');
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
      name: config!.serverName,
      version: config!.serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 도구 목록 조회 핸들러
  server.setRequestHandler(ListToolsRequestSchema, async () => {
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
        description: 'Search documents using BM25 algorithm with auto-classified domains. Takes keyword arrays and returns relevant document chunks.',
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
              description: 'Domain to search in (optional). Use list-domains to see available domains.'
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
        description: 'List all auto-generated domains and their document counts. Domains are created dynamically based on document content.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get-domain-info',
        description: 'Get detailed information about a specific domain.',
        inputSchema: {
          type: 'object',
          properties: {
            domainName: {
              type: 'string',
              description: 'Name of the domain to get information about'
            }
          },
          required: ['domainName']
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

    // 이 시점에서 모든 서비스가 null이 아님을 보장
    if (!repository || !repository.isInitialized() || !domainManager || !config) {
      throw new Error('Services are not properly initialized');
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
        const domainDetails = domainManager.getAllDomains();
        console.error(`[DEBUG] domains found: ${JSON.stringify(domains)}`);
        
        if (domains.length === 0) {
          const content: TextContent[] = [{
            type: 'text',
            text: `## Available Domains\n\nNo domains found. Check if documents are loaded properly.`
          }];
          return { content };
        }

        let domainList = "## Auto-Generated Domains\n\n";
        
        for (const domain of domains) {
          const details = domainDetails.find(d => d.name === domain.name);
          if (details) {
            domainList += `### ${details.displayName} (${domain.name})\n`;
            domainList += `- **Documents**: ${domain.documentCount}\n`;
            domainList += `- **Description**: ${details.description}\n`;
            domainList += `- **Keywords**: ${details.keywords.join(', ')}\n`;
            domainList += `- **Created**: ${details.createdAt.toISOString().split('T')[0]}\n\n`;
          } else {
            domainList += `- ${domain.name}: ${domain.documentCount} documents\n`;
          }
        }

        const content: TextContent[] = [{
          type: 'text',
          text: domainList
        }];
        
        return { content };
      }

      case 'get-domain-info': {
        const { domainName } = args as { domainName: string };
        const domainInfo = domainManager.getDomain(domainName);
        
        if (!domainInfo) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Domain '${domainName}' not found.`
          }];
          return { content };
        }

        const mappings = domainManager.getDomainMappings(domainName);
        
        let info = `# Domain: ${domainInfo.displayName}\n\n`;
        info += `**Name**: ${domainInfo.name}\n`;
        info += `**Description**: ${domainInfo.description}\n`;
        info += `**Document Count**: ${domainInfo.documentCount}\n`;
        info += `**Keywords**: ${domainInfo.keywords.join(', ')}\n`;
        info += `**Created**: ${domainInfo.createdAt.toISOString()}\n`;
        info += `**Last Updated**: ${domainInfo.lastUpdated.toISOString()}\n\n`;
        
        if (mappings.length > 0) {
          info += `## Document Mappings\n\n`;
          mappings.forEach((mapping, index) => {
            const fileName = mapping.filePath.split(/[/\\]/).pop() || mapping.filePath;
            info += `${index + 1}. **${fileName}** (confidence: ${mapping.confidence.toFixed(2)})\n`;
            info += `   - Path: ${mapping.filePath}\n`;
            info += `   - Assigned: ${mapping.assignedAt.toISOString()}\n\n`;
          });
        }

        const content: TextContent[] = [{
          type: 'text',
          text: info
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
  console.error(`[DEBUG] MCP server started successfully with auto-classification enabled`);
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
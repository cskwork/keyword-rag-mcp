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
import { logger } from './utils/logger.js';
import { validateToolArguments, ValidationError } from './utils/validation.js';

// 전역 변수
let repository: DocumentRepository | null = null;
let config: any = null;

logger.debug(`Module loaded at ${new Date().toISOString()}`);

/**
 * MCP 서버 초기화
 */
async function initializeServer(): Promise<void> {
  if (repository) {
    logger.debug(`Server already initialized`);
    return;
  }
  
  logger.debug(`Starting server initialization`);
  
  // 설정 로드
  logger.debug(`Loading config...`);
  config = await loadConfig();
  
  // 로거 레벨 설정
  logger.setLevel(config.logLevel);
  logger.debug(`Config loaded`);
  logger.debug(`config.documentSource.basePath=${config.documentSource.basePath}`);
  logger.debug(`config.documentSource.domains length=${config.documentSource.domains.length}`);
  config.documentSource.domains.forEach((d: {name: string; path: string; category?: string})=>
    logger.debug(`domain-> name:${d.name}, path:${d.path}`)
  );

  // 문서 로드
  logger.debug(`Creating DocumentLoader...`);
  const loader = new DocumentLoader(config.documentSource);
  logger.debug(`Loading documents...`);
  const documents = await loader.loadAllDocuments();
  logger.debug(`Documents loaded: ${documents.length} documents`);

  // 저장소 생성 (생성자에서 동기적으로 초기화)
  logger.debug(`Creating and initializing DocumentRepository...`);
  repository = new DocumentRepository(documents);
  
  const stats = repository.getStatistics();
  logger.debug(`Repository fully initialized`);
  logger.debug(`Repository stats: ${JSON.stringify(stats)}`);
  
  logger.debug(`Server initialization completed successfully`);
}

/**
 * 서버 준비 상태 보장
 */
function ensureServerReady(): DocumentRepository {
  if (!repository) {
    throw new Error('Server not initialized. Call initializeServer() first.');
  }
  
  if (!repository.isInitialized()) {
    throw new Error('Repository not properly initialized.');
  }
  
  return repository;
}

/**
 * MCP 서버 생성 및 시작
 */
async function main() {
  logger.debug(`Starting main() function at ${new Date().toISOString()}`);
  
  // 서버 초기화
  logger.debug(`About to call initializeServer()`);
  await initializeServer();
  logger.debug(`initializeServer() completed, repository exists: ${!!repository}`);
  logger.debug(`Repository initialized: ${repository?.isInitialized()}`);

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
      // ListTools는 단순 도구 목록 반환이므로 초기화 강제 안함
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
    
    logger.debug(`Tool called: ${name}`);
    logger.debug(`Repository state: ${repository ? 'EXISTS' : 'NULL'}`);
    
    // 입력 매개변수 검증
    let validatedArgs: any;
    try {
      validatedArgs = validateToolArguments(name, args);
    } catch (error) {
      if (error instanceof ValidationError) {
        const content: TextContent[] = [{
          type: 'text',
          text: `Invalid parameters: ${error.message}`
        }];
        return { content };
      }
      throw error;
    }
    
    // 도구 호출 전에 반드시 서버 준비 상태 확인
    let activeRepository: DocumentRepository;
    try {
      activeRepository = ensureServerReady();
    } catch (error) {
      logger.error('Server not ready for tool call:', error);
      const content: TextContent[] = [{
        type: 'text',
        text: 'Server is not initialized. Please restart the server.'
      }];
      return { content };
    }

    // 상태 로깅
    logger.debug(`Repository instance ID: ${activeRepository.getInstanceId()}`);
    logger.debug(`Repository documents count: ${activeRepository.getStatistics().totalDocuments}`);

    switch (name) {
      case 'search-documents': {
        const { keywords, domain, topN } = validatedArgs;

        const results = await activeRepository.searchDocuments(keywords, {
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
        const { id } = validatedArgs;
        const document = activeRepository.getDocumentById(id);

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
        logger.debug(`list-domains called`);
        const domains = activeRepository.listDomains();
        logger.debug(`domains found: ${JSON.stringify(domains)}`);
        
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
        const { documentId, chunkId, windowSize } = validatedArgs;

        const document = activeRepository.getDocumentById(documentId);
        if (!document) {
          const content: TextContent[] = [{
            type: 'text',
            text: `Document with ID ${documentId} not found.`
          }];
          
          return { content };
        }

        const chunks = document.getChunkWithWindow(chunkId, windowSize);
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
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 서버 시작
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
}); 
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

// 전역 변수
let repository: DocumentRepository | null = null;
let config: any = null;

/**
 * MCP 서버 초기화
 */
async function initializeServer() {
  // 설정 로드
  config = await loadConfig();
  console.error(`[DEBUG] Config loaded: ${JSON.stringify(config, null, 2)}`);

  // 문서 로드
  const loader = new DocumentLoader(config.documentSource);
  const documents = await loader.loadAllDocuments();
  console.error(`[DEBUG] Documents loaded: ${documents.length} documents`);

  // 저장소 초기화
  repository = new DocumentRepository(documents);
  const stats = repository.getStatistics();
  console.error(`[DEBUG] Repository stats: ${JSON.stringify(stats)}`);
}

/**
 * MCP 서버 생성 및 시작
 */
async function main() {
  // 서버 초기화
  await initializeServer();

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
    const tools: Tool[] = [
        {
          name: 'search-documents',
          description: 'BM25 알고리즘을 사용하여 문서를 검색합니다. 키워드 배열을 입력받아 관련성이 높은 문서 청크를 반환합니다.',
          inputSchema: {
            type: 'object',
            properties: {
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: '검색할 키워드 배열 (예: ["결제", "API", "인증"])'
              },
              domain: {
                type: 'string',
                description: '검색할 도메인 (선택사항, 예: "company", "customer")'
              },
              topN: {
                type: 'number',
                description: '반환할 최대 결과 수 (기본값: 10)',
                default: 10
              }
            },
            required: ['keywords']
          }
        },
        {
          name: 'get-document-by-id',
          description: '문서 ID로 전체 문서를 조회합니다.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: '조회할 문서 ID'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'list-domains',
          description: '사용 가능한 도메인 목록을 조회합니다.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get-chunk-with-context',
          description: '특정 청크와 주변 컨텍스트를 함께 조회합니다.',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: {
                type: 'number',
                description: '문서 ID'
              },
              chunkId: {
                type: 'number',
                description: '청크 ID'
              },
              windowSize: {
                type: 'number',
                description: '컨텍스트 윈도우 크기 (기본값: 1)',
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
    if (!repository) {
      throw new Error('Repository not initialized');
    }

    const { name, arguments: args } = request.params;

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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { ProcessManager } from './ProcessManager.js';
import { ServerStateManager } from './ServerStateManager.js';
import { ServerInitializer } from './ServerInitializer.js';
// Removed FileWatcherManager - simplified
import { SearchHandler } from '../handlers/SearchHandler.js';
import { DocumentHandler } from '../handlers/DocumentHandler.js';
import { SystemHandler } from '../handlers/SystemHandler.js';

/**
 * MCP 서버 메인 클래스
 */
export class McpServer {
  private server: Server;
  private stateManager: ServerStateManager;
  private serverInitializer: ServerInitializer;
  // Removed FileWatcherManager - simplified
  private searchHandler: SearchHandler;
  private documentHandler: DocumentHandler;
  private systemHandler: SystemHandler;

  constructor() {
    this.server = new Server(
      {
        name: 'knowledge-retrieval-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // 상태 관리자 및 핸들러 초기화
    this.stateManager = ServerStateManager.getInstance();
    this.serverInitializer = new ServerInitializer();
    // Removed FileWatcherManager initialization
    this.searchHandler = new SearchHandler();
    this.documentHandler = new DocumentHandler();
    this.systemHandler = new SystemHandler();

    this.setupToolHandlers();
    this.setupErrorHandlers();
  }

  /**
   * MCP 도구 정의
   */
  private getToolDefinitions(): Tool[] {
    return [
      {
        name: 'search-documents',
        description: 'BM25 알고리즘을 사용하여 키워드 배열로 문서를 검색합니다',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: '검색할 키워드 배열'
            },
            domain: {
              type: 'string',
              description: '검색할 도메인 (선택사항)'
            },
            limit: {
              type: 'number',
              description: '반환할 최대 결과 수 (기본값: 10, 최대: 50)',
              default: 10,
              maximum: 50
            }
          },
          required: ['keywords']
        }
      },
      {
        name: 'get-document-by-id',
        description: 'ID로 특정 문서를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: '조회할 문서의 ID'
            },
            includeContent: {
              type: 'boolean',
              description: '문서 내용 포함 여부 (기본값: true)',
              default: true
            }
          },
          required: ['documentId']
        }
      },
      {
        name: 'list-domains',
        description: '사용 가능한 모든 도메인과 문서 수를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get-chunk-with-context',
        description: '특정 문서의 청크를 주변 컨텍스트와 함께 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: '문서 ID'
            },
            chunkIndex: {
              type: 'number',
              description: '청크 인덱스'
            },
            contextSize: {
              type: 'number',
              description: '앞뒤로 포함할 청크 수 (기본값: 2, 최대: 5)',
              default: 2,
              maximum: 5
            }
          },
          required: ['documentId', 'chunkIndex']
        }
      },
      {
        name: 'health-check',
        description: '서버 상태 및 시스템 건강 상태를 확인합니다',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get-cache-stats',
        description: '캐시 통계 정보를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get-search-analytics',
        description: '검색 분석 데이터를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            timeRange: {
              type: 'string',
              description: '시간 범위 (예: "1h", "24h", "7d")',
              enum: ['1h', '24h', '7d', '30d']
            },
            domain: {
              type: 'string',
              description: '특정 도메인 필터'
            }
          }
        }
      },
      {
        name: 'get-document-metadata',
        description: '문서 메타데이터를 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: '특정 도메인 필터 (선택사항)'
            }
          }
        }
      },
      {
        name: 'get-system-metrics',
        description: '시스템 성능 메트릭을 조회합니다',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  /**
   * 도구 핸들러 설정
   */
  private setupToolHandlers(): void {
    // 도구 목록 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions()
    }));

    // 도구 호출 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`[DEBUG] 도구 호출: ${name}, 인수: ${JSON.stringify(args)}`);

      try {
        switch (name) {
          case 'search-documents':
            return await this.searchHandler.handleSearchDocuments(args);

          case 'get-document-by-id':
            return await this.documentHandler.handleGetDocumentById(args);

          case 'list-domains':
            return await this.documentHandler.handleListDomains();

          case 'get-chunk-with-context':
            return await this.searchHandler.handleGetChunkWithContext(args);

          case 'health-check':
            return await this.systemHandler.handleHealthCheck();

          case 'get-cache-stats':
            // Removed cache stats - simplified
            return { content: [{ type: 'text', text: 'Cache disabled for simplicity' }] };

          case 'get-search-analytics':
            // Removed analytics - simplified  
            return { content: [{ type: 'text', text: 'Analytics disabled for simplicity' }] };

          case 'get-document-metadata':
            return await this.documentHandler.handleGetDocumentMetadata(args);

          case 'get-system-metrics':
            // Use existing method
            return await this.systemHandler.handleGetStatistics();

          default:
            throw new Error(`알 수 없는 도구: ${name}`);
        }
      } catch (error) {
        console.error(`[ERROR] 도구 호출 실패 (${name}): ${error}`);
        throw error;
      }
    });
  }

  /**
   * 오류 핸들러 설정
   */
  private setupErrorHandlers(): void {
    this.server.onerror = (error) => {
      console.error(`[ERROR] MCP 서버 오류: ${error}`);
    };
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    try {
      console.error(`[DEBUG] MCP 서버 시작 중...`);

      // 프로세스 잠금 설정
      ProcessManager.checkAndSetProcessLock();

      // 서버 초기화
      await this.serverInitializer.initializeServer();

      // 파일 감시 제거됨 (간소화)

      // 서버 연결
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error(`[DEBUG] MCP 서버가 성공적으로 시작되었습니다`);

    } catch (error) {
      console.error(`[ERROR] MCP 서버 시작 실패: ${error}`);
      process.exit(1);
    }
  }

  /**
   * 서버 정지
   */
  async stop(): Promise<void> {
    try {
      console.error(`[DEBUG] MCP 서버 정지 중...`);

      // 파일 감시 제거됨 (간소화)

      // 서버 연결 해제
      await this.server.close();

      // PID 파일 정리
      ProcessManager.cleanup();

      console.error(`[DEBUG] MCP 서버가 정지되었습니다`);

    } catch (error) {
      console.error(`[ERROR] MCP 서버 정지 실패: ${error}`);
    }
  }
}
#!/usr/bin/env node

import { McpServer } from './server/McpServer.js';

/**
 * MCP 지식 검색 서버 진입점
 * BM25 알고리즘을 사용한 문서 검색 및 검색 서비스 제공
 */

console.error(`[DEBUG] 모듈 로드 완료: ${new Date().toISOString()}`);

/**
 * 메인 함수 - 서버 시작
 */
async function main(): Promise<void> {
  console.error(`[DEBUG] MCP 지식 검색 서버 시작...`);
  
  try {
    const mcpServer = new McpServer();
    await mcpServer.start();
    
    console.error(`[DEBUG] 서버가 성공적으로 시작되었습니다`);
    
  } catch (error) {
    console.error(`[ERROR] 서버 시작 실패: ${error}`);
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

// 메인 함수 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[ERROR] 처리되지 않은 오류: ${error}`);
    process.exit(1);
  });
}
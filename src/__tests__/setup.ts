import { jest, beforeEach, afterEach } from '@jest/globals';

// Jest 설정 파일
// 테스트 환경 설정 및 전역 모킹

// 콘솔 에러 억제 (테스트 중 로그 출력 방지)
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

// 타임아웃 설정
jest.setTimeout(30000);

export {};
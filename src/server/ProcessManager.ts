import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 프로세스 관리자 - PID 파일을 통한 중복 실행 방지 및 신호 처리
 */
export class ProcessManager {
  private static readonly PID_FILE = path.join(os.tmpdir(), 'mcp-knowledge-retrieval.pid');

  /**
   * 프로세스 잠금 확인 및 설정
   */
  static checkAndSetProcessLock(): void {
    try {
      if (fs.existsSync(this.PID_FILE)) {
        const existingPid = fs.readFileSync(this.PID_FILE, 'utf8').trim();
        
        // 기존 프로세스가 실행 중인지 확인
        try {
          process.kill(parseInt(existingPid), 0); // 시그널 0으로 프로세스 존재 확인
          console.error(`[ERROR] MCP server already running with PID ${existingPid}`);
          console.error(`[ERROR] Kill existing process first: kill ${existingPid}`);
          process.exit(1);
        } catch (e) {
          // 프로세스가 존재하지 않으면 PID 파일 제거
          console.error(`[DEBUG] Stale PID file found, removing...`);
          fs.unlinkSync(this.PID_FILE);
        }
      }
      
      // 현재 프로세스 PID 저장
      fs.writeFileSync(this.PID_FILE, process.pid.toString());
      console.error(`[DEBUG] Process lock acquired, PID: ${process.pid}`);
      
      // 프로세스 종료 시 PID 파일 정리
      this.setupCleanupHandlers();
      
    } catch (error) {
      console.error(`[ERROR] Failed to set process lock: ${error}`);
      process.exit(1);
    }
  }

  /**
   * 정리 핸들러 설정 - 프로세스 종료 시 PID 파일 제거
   */
  private static setupCleanupHandlers(): void {
    process.on('exit', () => {
      try {
        if (fs.existsSync(this.PID_FILE)) {
          fs.unlinkSync(this.PID_FILE);
        }
      } catch (e) {
        // 무시 - 이미 정리된 경우
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

    // 처리되지 않은 예외 핸들링
    process.on('uncaughtException', (error) => {
      console.error(`[ERROR] Uncaught exception: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[ERROR] Unhandled rejection at:`, promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * PID 파일 정리 (수동 호출용)
   */
  static cleanup(): void {
    try {
      if (fs.existsSync(this.PID_FILE)) {
        fs.unlinkSync(this.PID_FILE);
        console.error(`[DEBUG] PID file cleaned up`);
      }
    } catch (error) {
      console.error(`[ERROR] Failed to cleanup PID file: ${error}`);
    }
  }
}
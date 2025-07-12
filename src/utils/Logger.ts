import * as fs from 'fs';
import * as path from 'path';

/**
 * 통합 로깅 시스템 - 콘솔 및 파일 로깅 지원
 */
export class Logger {
  private static instance: Logger;
  private logDir: string;
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;

  private constructor(config: LoggerConfig) {
    this.logDir = config.logDir || './logs';
    this.logLevel = this.parseLogLevel(config.level || 'info');
    this.enableConsole = config.enableConsole !== false;
    this.enableFile = config.enableFile !== false;
    
    this.ensureLogDirectory();
  }

  /**
   * 싱글톤 인스턴스 초기화 및 반환
   */
  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      if (!config) {
        throw new Error('Logger configuration required for first initialization');
      }
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * 로그 디렉토리 생성
   */
  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      
      // 하위 디렉토리들 생성
      const subdirs = ['access', 'error', 'debug', 'system'];
      subdirs.forEach(subdir => {
        const subdirPath = path.join(this.logDir, subdir);
        if (!fs.existsSync(subdirPath)) {
          fs.mkdirSync(subdirPath, { recursive: true });
        }
      });
    } catch (error) {
      console.error(`[Logger] Failed to create log directory: ${error}`);
    }
  }

  /**
   * 로그 레벨 파싱
   */
  private parseLogLevel(level: string): LogLevel {
    const levels: { [key: string]: LogLevel } = {
      'error': LogLevel.ERROR,
      'warn': LogLevel.WARN,
      'info': LogLevel.INFO,
      'debug': LogLevel.DEBUG
    };
    return levels[level.toLowerCase()] || LogLevel.INFO;
  }

  /**
   * 로그 메시지 포맷팅
   */
  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level].padEnd(5);
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${levelStr} | ${message}${metaStr}`;
  }

  /**
   * 파일에 로그 기록
   */
  private writeToFile(level: LogLevel, formattedMessage: string): void {
    if (!this.enableFile) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      let filename: string;
      
      // 로그 레벨에 따른 파일 분류
      switch (level) {
        case LogLevel.ERROR:
          filename = path.join(this.logDir, 'error', `error-${today}.log`);
          break;
        case LogLevel.DEBUG:
          filename = path.join(this.logDir, 'debug', `debug-${today}.log`);
          break;
        default:
          filename = path.join(this.logDir, 'system', `app-${today}.log`);
      }

      fs.appendFileSync(filename, formattedMessage + '\n');
      
    } catch (error) {
      console.error(`[Logger] Failed to write to file: ${error}`);
    }
  }

  /**
   * 로그 기록 (내부 메서드)
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    // 로그 레벨 확인
    if (level > this.logLevel) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    // 콘솔 출력
    if (this.enableConsole) {
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }

    // 파일 기록
    this.writeToFile(level, formattedMessage);
  }

  /**
   * 에러 로그
   */
  error(message: string, meta?: any): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * 경고 로그
   */
  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * 정보 로그
   */
  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * 디버그 로그
   */
  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * 접근 로그 (특별한 형식)
   */
  access(method: string, urlPath: string, statusCode: number, duration: number): void {
    const accessMessage = `${method} ${urlPath} ${statusCode} ${duration}ms`;
    const formattedMessage = this.formatMessage(LogLevel.INFO, accessMessage);
    
    if (this.enableConsole) {
      console.log(formattedMessage);
    }

    if (this.enableFile) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const filename = path.join(this.logDir, 'access', `access-${today}.log`);
        fs.appendFileSync(filename, formattedMessage + '\n');
      } catch (error) {
        console.error(`[Logger] Failed to write access log: ${error}`);
      }
    }
  }

  /**
   * 로그 설정 업데이트
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    if (config.level) {
      this.logLevel = this.parseLogLevel(config.level);
    }
    if (config.enableConsole !== undefined) {
      this.enableConsole = config.enableConsole;
    }
    if (config.enableFile !== undefined) {
      this.enableFile = config.enableFile;
    }
    if (config.logDir) {
      this.logDir = config.logDir;
      this.ensureLogDirectory();
    }
  }

  /**
   * 로그 파일 정리 (오래된 파일 삭제)
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const subdirs = ['access', 'error', 'debug', 'system'];
    
    for (const subdir of subdirs) {
      try {
        const subdirPath = path.join(this.logDir, subdir);
        if (!fs.existsSync(subdirPath)) continue;

        const files = fs.readdirSync(subdirPath);
        for (const file of files) {
          const filePath = path.join(subdirPath, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            this.debug(`Cleaned up old log file: ${filePath}`);
          }
        }
      } catch (error) {
        this.error(`Failed to cleanup logs in ${subdir}`, { error: (error as Error).toString() });
      }
    }
  }
}

/**
 * 로그 레벨 열거형
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * 로거 설정 인터페이스
 */
export interface LoggerConfig {
  logDir?: string;
  level?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
}

/**
 * 전역 로거 인스턴스 (편의 함수들)
 */
let globalLogger: Logger | null = null;

export function initializeLogger(config: LoggerConfig): Logger {
  globalLogger = Logger.getInstance(config);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger first.');
  }
  return globalLogger;
}

// 편의 함수들
export const log = {
  error: (message: string, meta?: any) => getLogger().error(message, meta),
  warn: (message: string, meta?: any) => getLogger().warn(message, meta),
  info: (message: string, meta?: any) => getLogger().info(message, meta),
  debug: (message: string, meta?: any) => getLogger().debug(message, meta),
  access: (method: string, urlPath: string, statusCode: number, duration: number) => 
    getLogger().access(method, urlPath, statusCode, duration)
};
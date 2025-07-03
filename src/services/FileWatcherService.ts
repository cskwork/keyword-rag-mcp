import { watch, FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

/**
 * 파일 변경 이벤트 타입
 */
export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: any;
}

/**
 * 파일 시스템 감시 서비스
 * 문서 폴더의 변경사항을 실시간으로 감지
 */
export class FileWatcherService extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private watchedPath: string | null = null;
  private isWatching = false;

  /**
   * 폴더 감시 시작
   * @param basePath 감시할 기본 경로
   * @param options 감시 옵션
   */
  startWatching(basePath: string, options: {
    ignoreInitial?: boolean;
    persistent?: boolean;
    ignored?: string[];
  } = {}): void {
    if (this.isWatching) {
      console.error('[DEBUG] FileWatcherService: 이미 감시 중입니다.');
      return;
    }

    const defaultOptions = {
      ignoreInitial: true,
      persistent: true,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.vscode/**',
        '**/temp/**',
        '**/tmp/**',
        '**/.DS_Store',
        '**/Thumbs.db'
      ]
    };

    const watchOptions = { ...defaultOptions, ...options };

    try {
      this.watcher = watch(basePath, watchOptions);
      this.watchedPath = basePath;
      this.isWatching = true;

      // 이벤트 리스너 등록
      this.setupEventListeners();

      console.error(`[DEBUG] FileWatcherService: 감시 시작 - ${basePath}`);
    } catch (error) {
      console.error(`[DEBUG] FileWatcherService: 감시 시작 실패 - ${(error as Error).message}`);
      this.emit('error', error);
    }
  }

  /**
   * 폴더 감시 중지
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      await this.watcher.close();
      this.watcher = null;
      this.watchedPath = null;
      this.isWatching = false;

      console.error('[DEBUG] FileWatcherService: 감시 중지');
    } catch (error) {
      console.error(`[DEBUG] FileWatcherService: 감시 중지 실패 - ${(error as Error).message}`);
      this.emit('error', error);
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    if (!this.watcher) return;

    // 파일 추가
    this.watcher.on('add', (filePath: string, stats?: any) => {
      if (this.isMarkdownFile(filePath)) {
        this.emitChangeEvent('add', filePath, stats);
      }
    });

    // 파일 변경
    this.watcher.on('change', (filePath: string, stats?: any) => {
      if (this.isMarkdownFile(filePath)) {
        this.emitChangeEvent('change', filePath, stats);
      }
    });

    // 파일 삭제
    this.watcher.on('unlink', (filePath: string) => {
      if (this.isMarkdownFile(filePath)) {
        this.emitChangeEvent('unlink', filePath);
      }
    });

    // 디렉토리 추가
    this.watcher.on('addDir', (dirPath: string, stats?: any) => {
      if (this.isValidDomainDirectory(dirPath)) {
        this.emitChangeEvent('addDir', dirPath, stats);
      }
    });

    // 디렉토리 삭제
    this.watcher.on('unlinkDir', (dirPath: string) => {
      if (this.isValidDomainDirectory(dirPath)) {
        this.emitChangeEvent('unlinkDir', dirPath);
      }
    });

    // 에러 처리
    this.watcher.on('error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DEBUG] FileWatcherService: 감시 에러 - ${errorMessage}`);
      this.emit('error', error);
    });

    // 준비 완료
    this.watcher.on('ready', () => {
      console.error('[DEBUG] FileWatcherService: 감시 준비 완료');
      this.emit('ready');
    });
  }

  /**
   * 변경 이벤트 발생
   */
  private emitChangeEvent(type: FileChangeEvent['type'], filePath: string, stats?: any): void {
    const relativePath = this.getRelativePath(filePath);
    const event: FileChangeEvent = { type, path: relativePath, stats };

    console.error(`[DEBUG] FileWatcherService: ${type} - ${relativePath}`);
    this.emit('fileChange', event);
  }

  /**
   * 마크다운 파일 여부 확인
   */
  private isMarkdownFile(filePath: string): boolean {
    const extensions = ['.md', '.mdx', '.markdown'];
    return extensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  /**
   * 유효한 도메인 디렉토리인지 확인
   */
  private isValidDomainDirectory(dirPath: string): boolean {
    if (!this.watchedPath) return false;

    const relativePath = path.relative(this.watchedPath, dirPath);
    const parts = relativePath.split(path.sep);

    // 기본 경로 바로 아래의 디렉토리만 도메인으로 인식
    if (parts.length !== 1) return false;

    const dirName = parts[0];

    // 숨겨진 디렉토리 제외
    if (dirName.startsWith('.')) return false;

    // 시스템 디렉토리 제외
    const excludedDirs = ['node_modules', 'dist', 'build', '.git', '.vscode', 'temp', 'tmp'];
    if (excludedDirs.includes(dirName.toLowerCase())) return false;

    return true;
  }

  /**
   * 상대 경로 반환
   */
  private getRelativePath(filePath: string): string {
    if (!this.watchedPath) return filePath;
    return path.relative(this.watchedPath, filePath);
  }

  /**
   * 감시 상태 반환
   */
  getWatchingStatus(): {
    isWatching: boolean;
    watchedPath: string | null;
    watchedFiles: number;
  } {
    return {
      isWatching: this.isWatching,
      watchedPath: this.watchedPath,
      watchedFiles: this.watcher ? Object.keys(this.watcher.getWatched()).length : 0
    };
  }

  /**
   * 감시 중인 파일 목록 반환
   */
  getWatchedFiles(): Record<string, string[]> {
    if (!this.watcher) return {};
    return this.watcher.getWatched();
  }
}
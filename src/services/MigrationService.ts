import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';

/**
 * 마이그레이션 옵션
 */
export interface MigrationOptions {
  copyFiles?: boolean;    // 파일을 복사할지 이동할지 여부 (기본: true - 복사)
  updateConfig?: boolean; // config.json 파일도 업데이트할지 여부 (기본: true)
  createBackup?: boolean; // 기존 파일들의 백업을 생성할지 여부 (기본: true)
  dryRun?: boolean;      // 실제 실행하지 않고 계획만 출력 (기본: false)
}

/**
 * 마이그레이션 결과
 */
export interface MigrationResult {
  success: boolean;
  migratedFiles: string[];
  errors: string[];
  warnings: string[];
  summary: string;
}

/**
 * 마이그레이션 계획
 */
export interface MigrationPlan {
  sourceDir: string;
  targetDir: string;
  filesToCopy: Array<{
    source: string;
    target: string;
    isDirectory: boolean;
  }>;
  configChanges: {
    oldBasePath: string;
    newBasePath: string;
    autoDiscoveryEnabled: boolean;
  };
}

/**
 * docs/ → domain/ 마이그레이션 서비스
 */
export class MigrationService {
  private options: Required<MigrationOptions>;

  constructor(options: MigrationOptions = {}) {
    this.options = {
      copyFiles: options.copyFiles ?? true,
      updateConfig: options.updateConfig ?? true,
      createBackup: options.createBackup ?? true,
      dryRun: options.dryRun ?? false
    };
  }

  /**
   * 마이그레이션이 필요한지 확인
   * @param projectRoot 프로젝트 루트 디렉토리
   * @returns 마이그레이션 필요 여부
   */
  async checkMigrationNeeded(projectRoot: string): Promise<boolean> {
    const docsPath = path.join(projectRoot, 'docs');
    const domainPath = path.join(projectRoot, 'domain');
    
    // docs/ 디렉토리가 있고 domain/ 디렉토리가 없는 경우 마이그레이션 필요
    return fsSync.existsSync(docsPath) && !fsSync.existsSync(domainPath);
  }

  /**
   * 마이그레이션 계획 생성
   * @param projectRoot 프로젝트 루트 디렉토리
   * @returns 마이그레이션 계획
   */
  async createMigrationPlan(projectRoot: string): Promise<MigrationPlan | null> {
    const docsPath = path.join(projectRoot, 'docs');
    const domainPath = path.join(projectRoot, 'domain');

    if (!fsSync.existsSync(docsPath)) {
      console.error('[DEBUG] MigrationService: docs/ directory not found');
      return null;
    }

    const filesToCopy = await this.scanDirectory(docsPath, domainPath);
    
    return {
      sourceDir: docsPath,
      targetDir: domainPath,
      filesToCopy,
      configChanges: {
        oldBasePath: './docs',
        newBasePath: './domain',
        autoDiscoveryEnabled: true
      }
    };
  }

  /**
   * 마이그레이션 실행
   * @param projectRoot 프로젝트 루트 디렉토리
   * @returns 마이그레이션 결과
   */
  async migrate(projectRoot: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedFiles: [],
      errors: [],
      warnings: [],
      summary: ''
    };

    try {
      // 마이그레이션 계획 생성
      const plan = await this.createMigrationPlan(projectRoot);
      if (!plan) {
        result.errors.push('Migration plan could not be created - docs/ directory not found');
        result.summary = 'Migration failed: No docs/ directory found';
        return result;
      }

      console.error(`[DEBUG] MigrationService: Starting migration from ${plan.sourceDir} to ${plan.targetDir}`);
      
      if (this.options.dryRun) {
        result.summary = `DRY RUN: Would migrate ${plan.filesToCopy.length} items from docs/ to domain/`;
        result.success = true;
        return result;
      }

      // 백업 생성
      if (this.options.createBackup) {
        await this.createBackup(projectRoot);
        result.warnings.push('Backup created at docs-backup/');
      }

      // domain/ 디렉토리 생성
      if (!fsSync.existsSync(plan.targetDir)) {
        await fs.mkdir(plan.targetDir, { recursive: true });
        console.error(`[DEBUG] MigrationService: Created directory ${plan.targetDir}`);
      }

      // 파일/디렉토리 복사/이동
      for (const item of plan.filesToCopy) {
        try {
          if (item.isDirectory) {
            await fs.mkdir(item.target, { recursive: true });
            console.error(`[DEBUG] MigrationService: Created directory ${item.target}`);
          } else {
            await fs.mkdir(path.dirname(item.target), { recursive: true });
            if (this.options.copyFiles) {
              await fs.copyFile(item.source, item.target);
            } else {
              await fs.rename(item.source, item.target);
            }
            console.error(`[DEBUG] MigrationService: ${this.options.copyFiles ? 'Copied' : 'Moved'} file ${item.source} → ${item.target}`);
          }
          result.migratedFiles.push(item.target);
        } catch (error) {
          const errorMsg = `Failed to process ${item.source}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          console.error(`[DEBUG] MigrationService: ${errorMsg}`);
        }
      }

      // config.json 업데이트
      if (this.options.updateConfig) {
        try {
          await this.updateConfigFile(projectRoot, plan.configChanges);
          result.warnings.push('config.json updated with new basePath and autoDiscovery enabled');
        } catch (error) {
          result.warnings.push(`Failed to update config.json: ${(error as Error).message}`);
        }
      }

      result.success = result.errors.length === 0;
      result.summary = result.success 
        ? `Successfully migrated ${result.migratedFiles.length} items from docs/ to domain/`
        : `Migration completed with ${result.errors.length} errors`;

      console.error(`[DEBUG] MigrationService: ${result.summary}`);
      return result;

    } catch (error) {
      result.errors.push(`Migration failed: ${(error as Error).message}`);
      result.summary = 'Migration failed due to unexpected error';
      console.error('[DEBUG] MigrationService: Migration failed:', error);
      return result;
    }
  }

  /**
   * 디렉토리를 재귀적으로 스캔하여 파일 목록 생성
   * @param sourceDir 소스 디렉토리
   * @param targetDir 타겟 디렉토리
   * @returns 복사할 파일 목록
   */
  private async scanDirectory(
    sourceDir: string, 
    targetDir: string
  ): Promise<Array<{source: string; target: string; isDirectory: boolean}>> {
    const files: Array<{source: string; target: string; isDirectory: boolean}> = [];
    
    try {
      const entries = await fs.readdir(sourceDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        
        if (entry.isDirectory()) {
          files.push({ source: sourcePath, target: targetPath, isDirectory: true });
          // 하위 디렉토리 재귀 스캔
          const subFiles = await this.scanDirectory(sourcePath, targetPath);
          files.push(...subFiles);
        } else {
          files.push({ source: sourcePath, target: targetPath, isDirectory: false });
        }
      }
    } catch (error) {
      console.error(`[DEBUG] MigrationService: Error scanning directory ${sourceDir}:`, error);
    }
    
    return files;
  }

  /**
   * 백업 생성
   * @param projectRoot 프로젝트 루트 디렉토리
   */
  private async createBackup(projectRoot: string): Promise<void> {
    const docsPath = path.join(projectRoot, 'docs');
    const backupPath = path.join(projectRoot, 'docs-backup');
    
    if (fsSync.existsSync(backupPath)) {
      // 기존 백업이 있으면 타임스탬프 추가
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const timestampedBackup = path.join(projectRoot, `docs-backup-${timestamp}`);
      await fs.rename(backupPath, timestampedBackup);
    }
    
    await this.copyDirectory(docsPath, backupPath);
    console.error(`[DEBUG] MigrationService: Backup created at ${backupPath}`);
  }

  /**
   * 디렉토리 전체 복사
   * @param source 소스 디렉토리
   * @param target 타겟 디렉토리
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * config.json 파일 업데이트
   * @param projectRoot 프로젝트 루트 디렉토리
   * @param changes 적용할 변경사항
   */
  private async updateConfigFile(
    projectRoot: string, 
    changes: MigrationPlan['configChanges']
  ): Promise<void> {
    const configPath = path.join(projectRoot, 'config.json');
    
    if (!fsSync.existsSync(configPath)) {
      // config.json이 없으면 새로 생성
      const newConfig = {
        "serverName": "knowledge-retrieval",
        "serverVersion": "1.0.0",
        "documentSource": {
          "type": "local",
          "basePath": changes.newBasePath,
          "autoDiscovery": {
            "enabled": changes.autoDiscoveryEnabled
          }
        },
        "bm25": {
          "k1": 1.2,
          "b": 0.75
        },
        "chunk": {
          "minWords": 30,
          "contextWindowSize": 1
        },
        "logLevel": "info"
      };
      
      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
      console.error('[DEBUG] MigrationService: Created new config.json with domain/ basePath');
      return;
    }

    // 기존 config.json 업데이트
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    // basePath 업데이트
    if (config.documentSource) {
      config.documentSource.basePath = changes.newBasePath;
      config.documentSource.autoDiscovery = {
        enabled: changes.autoDiscoveryEnabled,
        ...(config.documentSource.autoDiscovery || {})
      };
    }
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.error('[DEBUG] MigrationService: Updated config.json with new basePath and autoDiscovery');
  }

  /**
   * 마이그레이션 상태 정보 조회
   * @param projectRoot 프로젝트 루트 디렉토리
   * @returns 마이그레이션 상태 정보
   */
  async getMigrationStatus(projectRoot: string): Promise<{
    hasDocsDir: boolean;
    hasDomainDir: boolean;
    migrationNeeded: boolean;
    estimatedFiles: number;
  }> {
    const docsPath = path.join(projectRoot, 'docs');
    const domainPath = path.join(projectRoot, 'domain');
    
    const hasDocsDir = fsSync.existsSync(docsPath);
    const hasDomainDir = fsSync.existsSync(domainPath);
    const migrationNeeded = hasDocsDir && !hasDomainDir;
    
    let estimatedFiles = 0;
    if (hasDocsDir) {
      const plan = await this.createMigrationPlan(projectRoot);
      estimatedFiles = plan?.filesToCopy.length || 0;
    }
    
    return {
      hasDocsDir,
      hasDomainDir,
      migrationNeeded,
      estimatedFiles
    };
  }
}
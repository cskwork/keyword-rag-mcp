// 실제 마이그레이션 실행 스크립트
import { MigrationService } from './dist/services/MigrationService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function doActualMigration() {
  console.log('=== Actual Migration Execution ===');
  
  const projectRoot = __dirname;
  const migrationService = new MigrationService({
    dryRun: false,  // 실제 실행
    copyFiles: true,  // 파일 복사 (원본 유지)
    createBackup: true,  // 백업 생성
    updateConfig: true   // config.json 업데이트
  });

  console.log('\n1. Checking migration status before...');
  const statusBefore = await migrationService.getMigrationStatus(projectRoot);
  console.log(`Before - Has docs/: ${statusBefore.hasDocsDir}, Has domain/: ${statusBefore.hasDomainDir}`);

  console.log('\n2. Executing migration...');
  const result = await migrationService.migrate(projectRoot);
  
  console.log(`\nMigration Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Summary: ${result.summary}`);
  
  if (result.migratedFiles.length > 0) {
    console.log(`\nMigrated files (${result.migratedFiles.length}):`);
    result.migratedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
  }
  
  if (result.warnings.length > 0) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(error => console.log(`  - ${error}`));
  }

  console.log('\n3. Checking migration status after...');
  const statusAfter = await migrationService.getMigrationStatus(projectRoot);
  console.log(`After - Has docs/: ${statusAfter.hasDocsDir}, Has domain/: ${statusAfter.hasDomainDir}`);
  console.log(`Migration needed now: ${statusAfter.migrationNeeded}`);
}

doActualMigration().catch(console.error);
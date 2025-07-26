/**
 * 보안 유틸리티
 * 파일 경로 새니타이징 및 URL 검증
 */

import path from 'path';
import * as fsSync from 'fs';
import { logger } from './logger.js';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * 안전한 파일 경로 검증 및 새니타이징
 */
export function sanitizeFilePath(filePath: string, basePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new SecurityError('Invalid file path');
  }

  if (!basePath || typeof basePath !== 'string') {
    throw new SecurityError('Invalid base path');
  }

  // 경로 정규화
  const normalizedPath = path.normalize(filePath);
  const normalizedBasePath = path.normalize(basePath);

  // 절대 경로로 변환
  let resolvedPath: string;
  if (path.isAbsolute(normalizedPath)) {
    resolvedPath = normalizedPath;
  } else {
    resolvedPath = path.resolve(normalizedBasePath, normalizedPath);
  }

  // 경로 순회 공격 검사 (directory traversal)
  if (!resolvedPath.startsWith(normalizedBasePath)) {
    throw new SecurityError('Path traversal attempt detected');
  }

  // 위험한 파일명 패턴 검사
  const filename = path.basename(resolvedPath);
  if (containsUnsafeFilePatterns(filename)) {
    throw new SecurityError('Unsafe file name detected');
  }

  // 허용된 파일 확장자 검사
  if (!isAllowedFileExtension(filename)) {
    throw new SecurityError('File extension not allowed');
  }

  return resolvedPath;
}

/**
 * URL 검증 및 새니타이징
 */
export function validateAndSanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new SecurityError('Invalid URL');
  }

  const trimmedUrl = url.trim();
  
  if (trimmedUrl.length === 0) {
    throw new SecurityError('Empty URL');
  }

  if (trimmedUrl.length > 2048) {
    throw new SecurityError('URL too long');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch (error) {
    throw new SecurityError('Malformed URL');
  }

  // 허용된 프로토콜 검사
  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    throw new SecurityError(`Protocol not allowed: ${parsedUrl.protocol}`);
  }

  // 로컬 네트워크 주소 차단 (SSRF 방지)
  if (isLocalNetworkAddress(parsedUrl.hostname)) {
    throw new SecurityError('Local network addresses not allowed');
  }

  // 위험한 포트 차단
  if (isDangerousPort(parsedUrl.port)) {
    throw new SecurityError(`Dangerous port detected: ${parsedUrl.port}`);
  }

  return parsedUrl.toString();
}

/**
 * 디렉토리 경로 검증 (파일 확장자 검사 제외)
 */
export function validateDirectoryPath(dirPath: string, basePath: string): string {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new SecurityError('Invalid directory path');
  }

  if (!basePath || typeof basePath !== 'string') {
    throw new SecurityError('Invalid base path');
  }

  // 경로 정규화
  const normalizedPath = path.normalize(dirPath);
  const normalizedBasePath = path.normalize(basePath);

  // 절대 경로로 변환
  let resolvedPath: string;
  if (path.isAbsolute(normalizedPath)) {
    resolvedPath = normalizedPath;
  } else {
    resolvedPath = path.resolve(normalizedBasePath, normalizedPath);
  }

  // 경로 순회 공격 검사 (directory traversal)
  if (!resolvedPath.startsWith(normalizedBasePath)) {
    throw new SecurityError('Path traversal attempt detected');
  }

  // 위험한 디렉토리명 패턴 검사 (파일 확장자 검사 제외)
  const dirname = path.basename(resolvedPath);
  if (containsUnsafeDirectoryPatterns(dirname)) {
    throw new SecurityError('Unsafe directory name detected');
  }

  // 경로가 실제로 존재하는지 확인
  if (!fsSync.existsSync(resolvedPath)) {
    throw new SecurityError('Directory does not exist');
  }

  // 디렉토리인지 확인
  const stats = fsSync.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new SecurityError('Path is not a directory');
  }

  // 읽기 권한 확인
  try {
    fsSync.accessSync(resolvedPath, fsSync.constants.R_OK);
  } catch (error) {
    throw new SecurityError('Directory not readable');
  }

  return resolvedPath;
}

/**
 * 위험한 디렉토리명 패턴 검사 (파일 확장자 검사 제외)
 */
function containsUnsafeDirectoryPatterns(dirname: string): boolean {
  const unsafePatterns = [
    // 숨김 폴더 (점으로 시작) - 단, .와 ..는 제외
    /^\.(?!\.$|\..$)/,
    
    // 시스템 폴더들
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
    
    // 위험한 문자들
    /[<>:"|?*\x00-\x1f]/,
    
    // 매우 긴 폴더명
    /^.{256,}/
  ];

  return unsafePatterns.some(pattern => pattern.test(dirname));
}

/**
 * 위험한 파일명 패턴 검사
 */
function containsUnsafeFilePatterns(filename: string): boolean {
  const unsafePatterns = [
    // 숨김 파일 (점으로 시작)
    /^\./,
    
    // 시스템 파일들
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
    
    // 실행 파일 확장자
    /\.(exe|bat|cmd|com|scr|pif|vbs|js|jar|app|deb|rpm)$/i,
    
    // 위험한 문자들
    /[<>:"|?*\x00-\x1f]/,
    
    // 매우 긴 파일명
    /^.{256,}/
  ];

  return unsafePatterns.some(pattern => pattern.test(filename));
}

/**
 * 허용된 파일 확장자 검사
 */
function isAllowedFileExtension(filename: string): boolean {
  const allowedExtensions = ['.md', '.mdx', '.markdown', '.txt'];
  const extension = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(extension);
}

/**
 * 로컬 네트워크 주소 검사 (SSRF 방지)
 */
function isLocalNetworkAddress(hostname: string): boolean {
  const localPatterns = [
    // IPv4 사설 주소
    /^127\./,           // 127.0.0.0/8 (localhost)
    /^10\./,            // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,      // 192.168.0.0/16
    /^169\.254\./,      // 169.254.0.0/16 (link-local)
    
    // IPv6 사설 주소
    /^::1$/,            // localhost
    /^fc00:/i,          // fc00::/7
    /^fe80:/i,          // fe80::/10 (link-local)
    
    // 로컬호스트
    /^localhost$/i,
    
    // 내부 도메인 패턴
    /\.local$/i,
    /\.internal$/i,
    /\.lan$/i
  ];

  return localPatterns.some(pattern => pattern.test(hostname));
}

/**
 * 위험한 포트 검사
 */
function isDangerousPort(port: string): boolean {
  if (!port) return false;
  
  const portNum = parseInt(port, 10);
  if (isNaN(portNum)) return false;

  // 시스템 예약 포트 및 위험한 포트들
  const dangerousPorts = [
    22,    // SSH
    23,    // Telnet
    25,    // SMTP
    53,    // DNS
    110,   // POP3
    143,   // IMAP
    993,   // IMAPS
    995,   // POP3S
    1433,  // SQL Server
    3306,  // MySQL
    5432,  // PostgreSQL
    6379,  // Redis
    27017, // MongoDB
  ];

  return dangerousPorts.includes(portNum) || portNum < 1024;
}

/**
 * 파일 읽기 보안 검사
 */
export function secureFileRead(filePath: string, basePath: string): string {
  const sanitizedPath = sanitizeFilePath(filePath, basePath);
  
  // 파일 존재 확인
  if (!fsSync.existsSync(sanitizedPath)) {
    throw new SecurityError('File does not exist');
  }

  // 파일인지 확인 (디렉토리나 다른 타입 차단)
  const stats = fsSync.statSync(sanitizedPath);
  if (!stats.isFile()) {
    throw new SecurityError('Path is not a file');
  }

  // 파일 크기 검사 (너무 큰 파일 차단)
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  if (stats.size > maxFileSize) {
    throw new SecurityError('File too large');
  }

  // 읽기 권한 확인
  try {
    fsSync.accessSync(sanitizedPath, fsSync.constants.R_OK);
  } catch (error) {
    throw new SecurityError('File not readable');
  }

  return sanitizedPath;
}

/**
 * 도메인 경로 보안 검증
 */
export function validateDomainPath(domainPath: string, basePath: string): string {
  try {
    return validateDirectoryPath(domainPath, basePath);
  } catch (error) {
    if (error instanceof SecurityError) {
      logger.warn(`Domain path validation failed: ${error.message}`);
      throw error;
    }
    logger.error('Unexpected error during domain path validation:', error);
    throw new SecurityError('Domain path validation failed');
  }
}
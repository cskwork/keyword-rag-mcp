import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';

/**
 * 마크다운을 헤더 기준으로 청크로 분할
 * @param markdown 마크다운 텍스트
 * @param maxDepth 분할 기준 헤더 깊이 (기본: 2)
 * @returns 청크 배열
 */
export function splitMarkdownIntoChunks(markdown: string, maxDepth: number = 2): string[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  const currentPosition = 0;

  // 마크다운을 줄 단위로 분할
  const lines = markdown.split('\n');
  
  // AST 트리 순회하며 헤더 위치 찾기
  const headerPositions: Array<{ line: number; depth: number }> = [];
  
  visit(tree, 'heading', (node: Heading) => {
    if (node.position && node.depth <= maxDepth) {
      headerPositions.push({
        line: node.position.start.line - 1, // 0-indexed로 변환
        depth: node.depth
      });
    }
  });

  // 헤더 위치를 기준으로 청크 생성
  headerPositions.forEach((header, index) => {
    // 이전 청크 저장
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n').trim());
      currentChunk = [];
    }

    // 현재 헤더부터 다음 헤더 전까지 수집
    const nextHeaderLine = index < headerPositions.length - 1 
      ? headerPositions[index + 1].line 
      : lines.length;

    for (let i = header.line; i < nextHeaderLine; i++) {
      currentChunk.push(lines[i]);
    }
  });

  // 마지막 청크 저장
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n').trim());
  }

  // 헤더가 없는 경우 전체를 하나의 청크로
  if (chunks.length === 0 && markdown.trim()) {
    chunks.push(markdown.trim());
  }

  return chunks;
}

/**
 * 작은 청크들을 병합하여 최소 단어 수 이상으로 만듦
 * @param chunks 원본 청크 배열
 * @param minWords 최소 단어 수 (기본: 30)
 * @returns 병합된 청크 배열
 */
export function joinShortChunks(chunks: string[], minWords: number = 30): string[] {
  const result: string[] = [];
  let buffer = "";
  let bufferWordCount = 0;

  for (const chunk of chunks) {
    const wordCount = chunk.split(/\s+/).filter(word => word.length > 0).length;
    
    // 청크가 최소 단어 수보다 작으면 버퍼에 추가
    if (wordCount < minWords) {
      buffer += (buffer ? "\n\n" : "") + chunk;
      bufferWordCount += wordCount;
      continue;
    }

    // 버퍼에 내용이 있으면 먼저 처리
    if (buffer) {
      result.push(buffer.trim());
      buffer = "";
      bufferWordCount = 0;
    }

    // 충분히 큰 청크는 그대로 추가
    result.push(chunk.trim());
  }

  // 남은 버퍼 처리
  if (buffer) {
    // 마지막 버퍼가 너무 작으면 이전 청크와 병합
    if (bufferWordCount < minWords / 2 && result.length > 0) {
      result[result.length - 1] += "\n\n" + buffer.trim();
    } else {
      result.push(buffer.trim());
    }
  }

  return result;
}

/**
 * 마크다운에서 메타데이터 추출
 * @param markdown 마크다운 텍스트
 * @returns 메타데이터 객체
 */
export function extractMetadata(markdown: string): {
  title: string;
  description: string;
  keywords: string[];
} {
  const lines = markdown.split('\n');
  let title = '';
  let description = '';
  const keywords: string[] = [];

  // 첫 번째 H1 헤더를 제목으로
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    title = h1Match[1].trim();
  }

  // 첫 번째 단락을 설명으로 (헤더 제외)
  const paragraphMatch = markdown.match(/^(?!#)(?!\s*$)(.+)$/m);
  if (paragraphMatch) {
    description = paragraphMatch[1].trim();
  }

  // 코드 블록, 링크, 강조 텍스트에서 키워드 추출
  const codeBlockMatches = markdown.match(/`([^`]+)`/g);
  if (codeBlockMatches) {
    codeBlockMatches.forEach(match => {
      const keyword = match.replace(/`/g, '').trim();
      if (keyword && !keywords.includes(keyword)) {
        keywords.push(keyword);
      }
    });
  }

  return { title, description, keywords };
} 
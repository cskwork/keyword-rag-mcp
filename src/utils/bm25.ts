/**
 * BM25 알고리즘 구현
 * 한국어 문서 검색을 위한 확률적 랭킹 함수
 */

export interface DocumentChunk {
  id: number;
  chunkId: number;
  originTitle: string;
  text: string;
  wordCount: number;
}

export interface SearchResult {
  id: number;
  chunkId: number;
  score: number;
}

export class BM25Calculator {
  private readonly allChunks: DocumentChunk[];
  private readonly totalCount: number;
  private readonly averageDocLength: number;
  private readonly N: number;

  constructor(
    chunks: DocumentChunk[],
    private readonly k1: number = 1.2,
    private readonly b: number = 0.75
  ) {
    this.allChunks = chunks;
    this.totalCount = chunks.reduce((count, chunk) => count + chunk.wordCount, 0);
    this.averageDocLength = this.totalCount / chunks.length;
    this.N = chunks.length;
  }

  /**
   * 주어진 키워드로 문서 검색
   * @param keywords 검색할 키워드 (정규식 패턴)
   * @returns 점수가 높은 순으로 정렬된 검색 결과
   */
  calculate(keywords: string): SearchResult[] {
    const { termFrequencies, docFrequencies } = this.calculateFrequencies(keywords);
    const scores = this.calculateScore(termFrequencies, docFrequencies);

    // 점수 기준 내림차순 정렬
    scores.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.totalTF - a.totalTF
    );

    return scores.map(({ id, score, chunkId }) => ({ id, chunkId, score }));
  }

  /**
   * 문서별 단어 빈도 계산
   */
  private calculateFrequencies(query: string) {
    const pattern = new RegExp(query, "gi");
    const termFrequencies: Record<number, Record<string, number>> = {};
    const docFrequencies: Record<string, number> = {};

    for (const chunk of this.allChunks) {
      const text = chunk.text;
      const matches = Array.from(text.matchAll(pattern));
      const termCounts: Record<string, number> = {};

      // 매치된 단어들의 빈도 계산
      for (const match of matches) {
        const term = match[0].toLowerCase();
        termCounts[term] = (termCounts[term] || 0) + 1;
      }

      if (Object.keys(termCounts).length > 0) {
        termFrequencies[chunk.chunkId] = termCounts;
        
        // 문서 빈도 업데이트
        for (const term of Object.keys(termCounts)) {
          docFrequencies[term] = (docFrequencies[term] || 0) + 1;
        }
      }
    }

    return { termFrequencies, docFrequencies };
  }

  /**
   * BM25 점수 계산
   */
  private calculateScore(
    termFrequencies: Record<number, Record<string, number>>,
    docFrequencies: Record<string, number>
  ): Array<{ id: number; chunkId: number; score: number; totalTF: number }> {
    return this.allChunks
      .filter((chunk) => termFrequencies[chunk.chunkId])
      .map((chunk) => {
        const tf = termFrequencies[chunk.chunkId];
        const len = chunk.wordCount;

        // BM25 점수 계산
        const score = Object.keys(tf)
          .map((term) => {
            const df = docFrequencies[term];
            const idf = Math.log((this.N - df + 0.5) / (df + 0.5));
            const numerator = tf[term] * (this.k1 + 1);
            const denominator =
              tf[term] +
              this.k1 * (1 - this.b + this.b * (len / this.averageDocLength));
            return idf * (numerator / denominator);
          })
          .reduce((sum, v) => sum + v, 0);

        const totalTF = Object.values(tf).reduce((sum, v) => sum + v, 0);

        return {
          id: chunk.id,
          chunkId: chunk.chunkId,
          score,
          totalTF
        };
      });
  }
}

/**
 * 정규식 특수문자 이스케이프
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
} 
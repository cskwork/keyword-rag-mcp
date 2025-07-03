/**
 * LRU 캐시 노드
 */
class CacheNode<T> {
  constructor(
    public key: string,
    public value: T,
    public prev: CacheNode<T> | null = null,
    public next: CacheNode<T> | null = null
  ) {}
}

/**
 * 캐시 통계 정보
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  oldestEntry?: string;
  newestEntry?: string;
}

/**
 * LRU 캐시 서비스
 * 검색 결과와 계산 결과를 메모리에 캐싱
 */
export class CacheService<T> {
  private cache = new Map<string, CacheNode<T>>();
  private head: CacheNode<T> | null = null;
  private tail: CacheNode<T> | null = null;
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxSize: number = 1000) {
    if (maxSize <= 0) {
      throw new Error('캐시 최대 크기는 1 이상이어야 합니다.');
    }
  }

  /**
   * 캐시에서 값 조회
   * @param key 캐시 키
   * @returns 캐시된 값 또는 undefined
   */
  get(key: string): T | undefined {
    const node = this.cache.get(key);
    
    if (!node) {
      this.misses++;
      return undefined;
    }

    this.hits++;
    this.moveToHead(node);
    return node.value;
  }

  /**
   * 캐시에 값 저장
   * @param key 캐시 키
   * @param value 저장할 값
   */
  set(key: string, value: T): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // 기존 노드 업데이트
      existingNode.value = value;
      this.moveToHead(existingNode);
      return;
    }

    // 새 노드 생성
    const newNode = new CacheNode(key, value);
    
    if (this.cache.size >= this.maxSize) {
      this.removeLRU();
    }

    this.addToHead(newNode);
    this.cache.set(key, newNode);
  }

  /**
   * 캐시에서 키 삭제
   * @param key 삭제할 키
   * @returns 삭제 성공 여부
   */
  delete(key: string): boolean {
    const node = this.cache.get(key);
    
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * 캐시 전체 삭제
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 캐시에 키가 존재하는지 확인
   * @param key 확인할 키
   * @returns 존재 여부
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * 캐시 크기 반환
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 캐시 통계 정보 반환
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      oldestEntry: this.tail?.key,
      newestEntry: this.head?.key
    };
  }

  /**
   * 캐시된 모든 키 반환
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 캐시된 모든 값 반환
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(node => node.value);
  }

  /**
   * 패턴에 매칭되는 키들 삭제
   * @param pattern 정규표현식 패턴
   * @returns 삭제된 키 개수
   */
  deleteByPattern(pattern: RegExp): number {
    let deletedCount = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.delete(key);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  /**
   * 노드를 헤드로 이동
   */
  private moveToHead(node: CacheNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  /**
   * 노드를 헤드에 추가
   */
  private addToHead(node: CacheNode<T>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * 노드 제거
   */
  private removeNode(node: CacheNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  /**
   * LRU 노드 제거
   */
  private removeLRU(): void {
    if (!this.tail) return;

    const lastNode = this.tail;
    this.removeNode(lastNode);
    this.cache.delete(lastNode.key);
  }
}

/**
 * 검색 결과 캐시 키 생성
 */
export function createSearchCacheKey(keywords: string[], domain?: string, maxResults?: number): string {
  const keywordStr = keywords.sort().join(',');
  const domainStr = domain || 'all';
  const maxResultsStr = maxResults?.toString() || 'default';
  
  return `search:${keywordStr}:${domainStr}:${maxResultsStr}`;
}

/**
 * BM25 계산 결과 캐시 키 생성
 */
export function createBM25CacheKey(query: string, domain?: string): string {
  const domainStr = domain || 'global';
  return `bm25:${query}:${domainStr}`;
}
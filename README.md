# MCP Knowledge Retrieval Server

BM25 기반 문서 검색 및 검색을 위한 MCP(Model Context Protocol) 서버입니다.

## 🚀 빠른 시작

### 1. 설치 및 빌드
```bash
# 의존성 설치
npm install

# 프로젝트 빌드
npm run build

# 개발 모드 실행
npm run dev
```

### 2. 설정 파일 생성
```bash
# 설정 파일 복사
cp config.example.json config.json
```

## 📋 설정 가이드

### config.json 설정
```json
{
  "serverName": "knowledge-retrieval",
  "serverVersion": "1.0.0",
  "documentSource": {
    "type": "local",
    "basePath": "./docs",
    "domains": [
      {
        "name": "company",
        "path": "company",
        "category": "회사정보"
      },
      {
        "name": "customer", 
        "path": "customer",
        "category": "고객서비스"
      }
    ]
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
}
```

### 주요 설정 항목
- **documentSource.basePath**: 문서 파일들이 위치한 기본 경로
- **domains**: 검색할 도메인들의 설정
- **bm25.k1**: BM25 알고리즘의 term frequency saturation 파라미터 (기본값: 1.2)
- **bm25.b**: BM25 알고리즘의 field length normalization 파라미터 (기본값: 0.75)
- **chunk.minWords**: 청크의 최소 단어 수 (기본값: 30)

## 🔧 Claude Desktop 연동 설정

Claude Desktop에서 이 MCP 서버를 사용하려면 다음 설정을 추가하세요:

### macOS
파일 위치: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Windows  
파일 위치: `%APPDATA%/Claude/claude_desktop_config.json`

### 설정 파일 내용
```json
{
  "mcpServers": {
    "knowledge-retrieval": {
      "command": "node",
      "args": ["/Users/danny/Documents/Git/MyDocGPT/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**중요**: `args` 배열의 경로를 실제 프로젝트 경로로 수정하세요!

### 상대 경로 사용 (권장)
npm을 통해 전역 설치한 경우:
```json
{
  "mcpServers": {
    "knowledge-retrieval": {
      "command": "npx",
      "args": ["mcp-knowledge-retrieval"],
      "cwd": "/Users/danny/Documents/Git/MyDocGPT"
    }
  }
}
```

## 📁 문서 구조

문서는 다음과 같은 구조로 구성되어야 합니다:

```
docs/
├── company/           # 회사 정보
│   ├── about.md
│   └── team.md
├── customer/          # 고객 서비스
│   ├── support.md
│   └── sla.md
├── product/           # 제품 정보
│   ├── ai-platform.md
│   └── web-app.md
└── technical/         # 기술 문서
    ├── api-guide.md
    └── deployment.md
```

### 지원 파일 형식
- `.md` (Markdown)
- `.mdx` (MDX)
- `.markdown`

## 🛠 사용 가능한 MCP 도구들

### 1. search-documents
문서 검색을 수행합니다.

**파라미터:**
- `keywords`: 검색할 키워드 배열
- `maxResults`: 최대 결과 수 (기본값: 10)
- `domain`: 특정 도메인으로 검색 제한 (선택사항)

**예시:**
```typescript
// Claude Desktop에서 사용할 때
"AI 플랫폼의 가격 정책을 알려줘"
```

### 2. get-document-by-id  
특정 문서 ID로 전체 문서를 가져옵니다.

**파라미터:**
- `documentId`: 문서 ID

### 3. list-domains
사용 가능한 모든 도메인과 문서 수를 조회합니다.

### 4. get-chunk-with-context
특정 청크와 그 주변 컨텍스트를 가져옵니다.

**파라미터:**
- `chunkId`: 청크 ID
- `contextSize`: 컨텍스트 윈도우 크기 (선택사항)

## 🧪 테스트 방법

### 1. 서버 상태 확인
```bash
npm run dev
```

성공시 다음과 같은 출력이 나타납니다:
```
Initializing knowledge-retrieval v1.0.0...
Loaded 8 documents
Initialized repository with 36 chunks from 8 documents
MCP server started successfully
```

### 2. Claude Desktop에서 테스트
Claude Desktop을 재시작한 후 다음과 같이 테스트해보세요:

**기본 검색:**
```
"우리 회사의 비전과 미션이 뭐야?"
```

**도메인 특정 검색:**
```
"AI 플랫폼의 가격 정책을 알려줘"
```

**기술 문서 검색:**
```
"API 인증 방법을 설명해줘"
```

### 3. 문제 해결

#### 서버가 시작되지 않는 경우
1. Node.js 버전 확인 (18 이상 필요)
2. 의존성 재설치: `npm install`
3. 빌드 재실행: `npm run build`

#### 문서가 로드되지 않는 경우
1. `docs/` 디렉토리 존재 확인
2. 마크다운 파일 존재 확인
3. 파일 권한 확인

#### Claude Desktop에서 도구가 보이지 않는 경우
1. 설정 파일 경로 확인
2. JSON 문법 오류 확인
3. Claude Desktop 재시작
4. 절대 경로 사용 확인

## 📊 성능 최적화

### BM25 파라미터 튜닝
- **k1 값 증가**: 단어 빈도의 영향 증가 (1.2 → 2.0)
- **b 값 조정**: 문서 길이 정규화 강도 (0.75 → 0.5)

### 청크 크기 최적화
- **minWords 증가**: 더 큰 컨텍스트, 느린 검색
- **minWords 감소**: 정확한 매칭, 빠른 검색

## 🔒 보안 고려사항

1. **파일 권한**: 문서 디렉토리에 적절한 읽기 권한 설정
2. **환경 변수**: 민감한 설정은 환경 변수로 관리
3. **네트워크**: 필요시 방화벽 규칙 설정

## 📝 환경 변수 지원

다음 환경 변수로 설정을 덮어쓸 수 있습니다:

```bash
export MCP_SERVER_NAME="my-knowledge-server"
export DOCS_BASE_PATH="./my-docs"
export BM25_K1="1.5"
export BM25_B="0.8"
export CHUNK_MIN_WORDS="50"
export LOG_LEVEL="debug"
```

## 🤝 기여하기

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 Push (`git push origin feature/AmazingFeature`)
5. Pull Request 생성

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 🆘 지원

문제가 발생하면 다음을 확인하세요:

1. [Issues](https://github.com/company/project/issues)에서 유사한 문제 검색
2. 로그 파일 확인 (`npm run dev` 출력)
3. 설정 파일 검증
4. 새로운 이슈 생성

---

**개발자 팁**: 개발 중에는 `npm run dev`를 사용하여 실시간으로 변경사항을 확인할 수 있습니다.
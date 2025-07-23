# MCP Knowledge Retrieval Server

🤖 **LLM 기반 자동 분류**와 **동적 도메인 생성**을 지원하는 차세대 MCP(Model Context Protocol) 지식 검색 서버입니다.

## ✨ 핵심 특징

- 🤖 **자동 문서 분류**: LLM이 문서 내용을 분석하여 적절한 도메인을 자동 생성
- 📂 **동적 도메인 관리**: 문서 내용에 따라 도메인이 자동으로 생성되고 관리됨
- 🔒 **영구 도메인 이름**: 한 번 생성된 도메인 이름은 세션 간에 일관성 유지
- ⚙️ **간소화된 설정**: 복잡한 JSON 설정 파일 제거, 순수 `.env` 기반 설정
- 🔍 **지능형 검색**: 자동 생성된 도메인 내에서 BM25 기반 검색 지원

## 🚀 즉시 시작하기

### 🎯 초간단 설치 (권장)
```bash
# macOS/Linux
./run.sh

# Windows
run.bat
```

이 스크립트들이 자동으로 처리합니다:
- ✅ Node.js 버전 확인
- ✅ 의존성 설치 (`npm install`)
- ✅ 프로젝트 빌드 (`npm run build`)
- ✅ 환경 설정 파일 생성 (`.env`)
- ✅ 예시 문서 생성 (`docs/` 폴더)
- ✅ Claude Desktop 설정 가이드 출력
- ✅ MCP 서버 실행

### 수동 설치
```bash
# 단계별 설치
npm install && npm run build && cp .env.example .env

# 서버 실행
npm start
```

### 개발 모드
```bash
npm run dev
```

## 📋 새로운 설정 방식

### .env 파일 (간소화됨!)
```bash
# MCP Server Configuration
MCP_SERVER_NAME=knowledge-retrieval
MCP_SERVER_VERSION=1.0.0

# Document Source Configuration
DOCS_SOURCE_TYPE=local
DOCS_BASE_PATH=./docs

# BM25 Search Algorithm Parameters
BM25_K1=1.2
BM25_B=0.75

# Document Chunking Configuration
CHUNK_MIN_WORDS=30
CONTEXT_WINDOW_SIZE=1

# LLM Classification Settings
CLASSIFICATION_ENABLED=true
AUTO_CLASSIFY_NEW_DOCS=true

# Logging Configuration
LOG_LEVEL=info
```

### 주요 변경사항
- ❌ **config.json 제거**: 복잡한 도메인 설정 불필요
- ✅ **자동 도메인 생성**: 문서 내용 기반으로 도메인 자동 생성
- ✅ **환경 변수 기반**: 모든 설정이 `.env` 파일로 단순화
- ✅ **도메인 지속성**: `.domain-data.json`에서 자동 관리

## 🔧 MCP 클라이언트 연동 (Claude Desktop 등)

MCP 클라이언트가 서버를 올바르게 실행하려면, `npm start` 명령을 사용하고 프로젝트의 루트 디렉토리를 작업 디렉토리(`cwd`)로 설정하는 것이 가장 안정적이고 권장되는 방법입니다.

### 설정 예시
아래 예시를 참고하여 사용 중인 MCP 클라이언트의 설정 파일에 추가하세요.

- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "knowledge-retrieval": {
      "command": "npm",
      "args": ["start"],
      "cwd": "<프로젝트_경로>"
    }
  }
}
```

**⚠️ 중요**:
- `knowledge-retrieval` 값은 `.env` 파일의 `MCP_SERVER_NAME`과 반드시 일치해야 합니다.
- `<프로젝트_경로>`는 이 프로젝트 폴더의 **절대 경로**로 반드시 변경해야 합니다. (예: `/Users/test/keyword-rag-mcp`)

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

## 🧪 테스트 및 검증

### 1. 서버 작동 확인
```bash
npm run dev
```
✅ 성공시 출력 예시:
```
Initializing knowledge-retrieval v1.0.0...
Loaded 8 documents
Initialized repository with 36 chunks from 8 documents
MCP server started successfully
```

### 2. Claude Desktop에서 즉시 테스트
Claude Desktop 재시작 후 다음 질문들로 테스트:

```
우리 회사의 비전과 미션이 뭐야?
AI 플랫폼의 가격 정책을 알려줘
API 인증 방법을 설명해줘
```

### 3. 빠른 문제 해결
| 문제 | 해결 방법 |
|------|-----------|
| 서버 시작 실패 | `npm install && npm run build` |
| 문서 로드 실패 | `docs/` 폴더와 `.md` 파일 확인 |
| Claude Desktop 연결 실패 | 설정 파일 경로 확인 후 Claude Desktop 재시작 |

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

## 📝 환경 변수 설정

```bash
export MCP_SERVER_NAME="my-knowledge-server"
export DOCS_BASE_PATH="./my-docs"
export BM25_K1="1.5"
export BM25_B="0.8"
export CHUNK_MIN_WORDS="50"
export LOG_LEVEL="debug"
```

## 🆘 문제 해결

문제 발생 시 확인 순서:
1. 로그 확인: `npm run dev` 출력 메시지
2. 설정 파일: `config.json` 문법 오류 확인
3. 문서 폴더: `docs/` 디렉토리와 `.md` 파일 확인
4. Claude Desktop: 설정 파일 경로 및 재시작

## 💡 핵심 요약

### 즉시 사용을 위한 체크리스트
**자동 설치 사용시:**
- [ ] `./run.sh` (또는 `run.bat`) 실행
- [ ] 스크립트가 출력하는 Claude Desktop 설정 복사
- [ ] Claude Desktop 재시작
- [ ] 테스트 질문으로 작동 확인

**수동 설치 사용시:**
- [ ] `npm install && npm run build && cp config.example.json config.json`
- [ ] `docs/` 폴더에 마크다운 파일 추가
- [ ] Claude Desktop 설정 파일에 프로젝트 경로 지정
- [ ] Claude Desktop 재시작
- [ ] 테스트 질문으로 작동 확인

### 주요 명령어
- **개발**: `npm run dev`
- **빌드**: `npm run build`
- **실행**: `npm start`
- **테스트**: `npm test`

---

**MIT 라이선스** | **개발 중에는 `npm run dev` 사용 권장**

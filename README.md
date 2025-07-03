# MCP Knowledge Retrieval Server

BM25 기반 문서 검색 및 검색을 위한 MCP(Model Context Protocol) 서버입니다.

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
- ✅ 설정 파일 생성 (`config.json`)
- ✅ 예시 문서 생성 (`docs/` 폴더)
- ✅ Claude Desktop 설정 가이드 출력
- ✅ MCP 서버 실행

### 수동 설치
```bash
# 단계별 설치
npm install && npm run build && cp config.example.json config.json

# 서버 실행
npm start
```

### 개발 모드
```bash
npm run dev
```

## 📋 설정 방법

### 🎯 자동 도메인 탐지 (권장)
이제 문서 폴더를 만들기만 하면 자동으로 도메인이 생성됩니다!

```json
{
  "serverName": "knowledge-retrieval",  
  "serverVersion": "1.0.0",
  "documentSource": {
    "type": "local",
    "basePath": "./docs",
    "autoDiscovery": true,
    "domains": []
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

### 📁 간단한 사용법
1. `docs/` 폴더에 새 폴더 생성
2. 마크다운 파일 추가
3. 서버 재시작 → 자동으로 새 도메인 인식! ✨

```bash
# 예시: 새 도메인 추가
mkdir docs/marketing
echo "# 마케팅 전략" > docs/marketing/strategy.md
npm start  # 자동으로 marketing 도메인 생성됨
```

### 🏷️ 커스텀 카테고리 설정
`categoryMapping.json` 파일로 한국어 카테고리 커스터마이징:

```json
{
  "company": "회사정보",
  "customer": "고객서비스", 
  "product": "제품정보",
  "technical": "기술문서",
  "marketing": "마케팅",
  "sales": "영업",
  "hr": "인사"
}
```

### ⚙️ 수동 설정 (기존 방식)
자동 탐지를 비활성화하고 수동으로 관리하려면:

```json
{
  "documentSource": {
    "autoDiscovery": false,
    "domains": [
      {
        "name": "company",
        "path": "company",
        "category": "회사정보"
      }
    ]
  }
}
```

### 주요 설정 항목
- **documentSource.autoDiscovery**: 자동 도메인 탐지 활성화 (기본값: true)
- **documentSource.basePath**: 문서 파일들이 위치한 기본 경로
- **domains**: 검색할 도메인들의 설정 (자동 탐지시 빈 배열 가능)
- **bm25.k1**: BM25 알고리즘의 term frequency saturation 파라미터 (기본값: 1.2)
- **bm25.b**: BM25 알고리즘의 field length normalization 파라미터 (기본값: 0.75)
- **chunk.minWords**: 청크의 최소 단어 수 (기본값: 30)

## 🔧 Claude Desktop 연동

### 설정 파일 위치
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

### 설정 내용 (절대 경로)
```json
{
  "mcpServers": {
    "knowledge-retrieval": {
      "command": "node",
      "args": ["<프로젝트_경로>/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**중요**: `<프로젝트_경로>`를 실제 프로젝트 폴더의 절대 경로로 바꾸세요!

### 권장 설정 (작업 디렉토리 지정)
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

## 📁 문서 구조

### 🎯 자동 구조 (권장)
폴더만 만들면 자동으로 도메인 생성:

```
docs/
├── company/           # 자동 생성: company 도메인
│   ├── about.md
│   └── team.md
├── customer/          # 자동 생성: customer 도메인  
│   ├── support.md
│   └── sla.md
├── marketing/         # 자동 생성: marketing 도메인
│   └── strategy.md
└── any-folder-name/   # 자동 생성: any-folder-name 도메인
    └── document.md
```

### 🔄 자동 탐지 특징
- **스마트 필터링**: `.git`, `node_modules`, 숨김 폴더 자동 제외
- **우선순위 정렬**: company → customer → product → technical → 나머지 알파벳순
- **카테고리 매핑**: `categoryMapping.json`으로 한국어 카테고리 설정
- **실시간 반영**: 새 폴더 추가 후 서버 재시작시 자동 인식

### 📋 지원 파일 형식
- `.md` (Markdown)
- `.mdx` (MDX) 
- `.markdown`

### 🚫 자동 제외되는 폴더
- `.git`, `.vscode`, `node_modules`
- `dist`, `build`, `temp`, `tmp`
- `.`으로 시작하는 숨김 폴더

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

### 🚀 즉시 사용을 위한 체크리스트
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

### ✨ 새로운 기능: 자동 도메인 탐지
- **폴더 추가**: `docs/` 안에 새 폴더 생성
- **카테고리 설정**: `categoryMapping.json` 파일로 커스터마이징
- **자동 인식**: 서버 재시작시 새 도메인 자동 추가
- **스마트 필터링**: 시스템 폴더 자동 제외

### 🔧 주요 명령어
- **개발**: `npm run dev`
- **빌드**: `npm run build`
- **실행**: `npm start`
- **테스트**: `npm test`
- **CLI**: `npm run cli -- <command>`

## 🛠️ CLI 도구

프로젝트에는 문서 관리를 위한 강력한 CLI 도구가 포함되어 있습니다:

### 설치 및 사용
```bash
# 전역 설치 (권장)
npm install -g .
mcp-knowledge-cli --help

# 또는 npm run cli 사용
npm run cli -- --help
```

### 문서 관리 명령어
```bash
# 문서 인덱싱
mcp-knowledge-cli index

# 도메인 자동 탐지
mcp-knowledge-cli discover -p ./docs --create-config

# 새 문서 추가
mcp-knowledge-cli add-doc technical README.md --copy
```

### 테스트 및 검증
```bash
# 검색 테스트
mcp-knowledge-cli search "API 인증" "JWT" -d technical -n 3

# 설정 검증
mcp-knowledge-cli validate

# 시스템 통계 확인
mcp-knowledge-cli stats --hours 24
```

### 서버 관리
```bash
# 개발 모드로 서버 시작
mcp-knowledge-cli serve --dev

# 상세 도움말
mcp-knowledge-cli help-extended
```

### 🎯 간단 사용법
1. 새 폴더 만들기: `mkdir docs/새도메인`
2. 문서 추가: `echo "# 내용" > docs/새도메인/문서.md`
3. 서버 재시작: `npm start`
4. 자동으로 새 도메인 인식됨! ✨

---

**MIT 라이선스** | **개발 중에는 `npm run dev` 사용 권장**
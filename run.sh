#!/bin/bash

# MCP Knowledge Retrieval Server - 자동 설치 및 실행 스크립트
# Auto Install and Run Script for MCP Knowledge Retrieval Server

set -e  # 오류 발생 시 스크립트 중단

echo "🚀 MCP Knowledge Retrieval Server 자동 설치 및 실행"
echo "================================================"

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📁 작업 디렉토리: $SCRIPT_DIR"

# MCP 서버 프로세스 클린업
echo ""
echo "🧹 기존 MCP 서버 프로세스 정리 중..."
TMP_DIR=$(node -p "require('os').tmpdir()")
PID_FILE="$TMP_DIR/mcp-knowledge-retrieval.pid"

if [ -f "$PID_FILE" ]; then
    EXISTING_PID=$(cat "$PID_FILE")
    if ps -p "$EXISTING_PID" > /dev/null; then
        echo "⚠️  실행 중인 프로세스(PID: $EXISTING_PID)를 종료합니다."
        kill -9 "$EXISTING_PID" || true
    else
        echo "ⓘ 이전 PID 파일($EXISTING_PID)은 유효하지 않습니다."
    fi
    rm -f "$PID_FILE"
    echo "✅ 이전 PID 파일이 삭제되었습니다."
else
    echo "✅ 실행 중인 프로세스가 없습니다."
fi


# Node.js 버전 확인
echo ""
echo "🔍 Node.js 버전 확인 중..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다. Node.js 18 이상을 설치해주세요."
    echo "   다운로드: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 이상이 필요합니다. 현재 버전: $(node -v)"
    exit 1
fi
echo "✅ Node.js 버전: $(node -v)"

# npm 버전 확인
echo "✅ npm 버전: $(npm -v)"

# 1. 의존성 설치
echo ""
echo "📦 의존성 설치 중..."
npm install

# 2. 프로젝트 빌드
echo ""
echo "🔨 프로젝트 빌드 중..."
npm run build

# 3. 설정 파일 생성 (존재하지 않는 경우)
echo ""
echo "⚙️  설정 파일 확인 중..."
if [ ! -f "config.json" ]; then
    echo "📝 config.json 파일 생성 중..."
    cp config.example.json config.json
    echo "✅ config.json 파일이 생성되었습니다."
else
    echo "✅ config.json 파일이 이미 존재합니다."
fi

# 4. docs 디렉토리 확인
echo ""
echo "📚 문서 디렉토리 확인 중..."
if [ ! -d "docs" ]; then
    echo "📁 docs 디렉토리 생성 중..."
    mkdir -p docs/company docs/customer docs/product docs/technical
    
    # 예시 문서 생성
    cat > docs/company/about.md << 'EOF'
# 회사 소개

## 우리의 비전
혁신적인 AI 기술로 더 나은 세상을 만들어갑니다.

## 우리의 미션  
고객에게 최고의 가치를 제공하는 것이 우리의 사명입니다.
EOF

    cat > docs/customer/support.md << 'EOF'
# 고객 지원

## 문의 방법
- 이메일: support@company.com
- 전화: 1588-0000
- 채팅: 웹사이트 우측 하단

## 운영 시간
평일 오전 9시 - 오후 6시
EOF

    echo "✅ 예시 문서가 생성되었습니다."
else
    echo "✅ docs 디렉토리가 존재합니다."
fi

# 5. 권한 설정
echo ""
echo "🔐 실행 권한 설정 중..."
chmod +x dist/index.js

# 6. 서버 실행
echo ""
echo "🎉 설치 완료! MCP 서버를 시작합니다..."
echo "================================================"
echo ""
echo "💡 Claude Desktop 설정 방법:"
echo "   1. Claude Desktop 설정 파일 열기:"
echo "      - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "      - Windows: %APPDATA%/Claude/claude_desktop_config.json"
echo ""
echo "   2. 다음 설정 추가:"
echo '   {'
echo '     "mcpServers": {'
echo '       "knowledge-retrieval": {'
echo '         "command": "npm",'
echo '         "args": ["start"],'
echo "         \"cwd\": \"$SCRIPT_DIR\""
echo '       }'
echo '     }'
echo '   }'
echo ""
echo "   3. Claude Desktop 재시작"
echo ""
echo "🚀 서버 시작 중..."
echo "   중단하려면 Ctrl+C를 누르세요."
echo ""

# 환경변수 설정 (선택사항)
export NODE_ENV=production

# MCP 서버 시작
npm start
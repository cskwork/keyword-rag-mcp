#!/bin/bash

# MCP Knowledge Retrieval Server - 자동 설치 및 실행 스크립트
# Auto Install and Run Script for MCP Knowledge Retrieval Server

set -e # 오류 발생 시 스크립트 중단

# 스크립트의 절대 경로를 미리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- 플래그 처리 ---
# --no-install 플래그가 있으면 설치 과정을 건너뛰고 서버만 실행
SERVER_ONLY=false
if [ "$1" == "--no-install" ]; then
  SERVER_ONLY=true
fi

# --- 초기 설정 및 설치 (SERVER_ONLY=false 일 때만 실행) ---
if [ "$SERVER_ONLY" = false ]; then
  echo "🚀 MCP Knowledge Retrieval Server 자동 설치 및 실행"
  echo "================================================"
  echo "📁 작업 디렉토리: $SCRIPT_DIR"

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
  echo "✅ npm 버전: $(npm -v)"

  # 1. 의존성 설치
  echo ""
  echo "📦 의존성 설치 중..."
  npm install

  # 2. 프로젝트 빌드
  echo ""
  echo "🔨 프로젝트 빌드 중..."
  npm run build

  # 3. .env 파일 생성 (존재하지 않는 경우)
  echo ""
  echo "⚙️  .env 설정 파일 확인 중..."
  if [ ! -f ".env" ]; then
      echo "📝 .env 파일이 없어 .env.example을 복사합니다..."
      cp .env.example .env
      echo "✅ .env 파일이 생성되었습니다. 필요시 API 키 등 설정을 수정하세요."
  else
      echo "✅ .env 파일이 이미 존재합니다."
  fi

  # 4. docs 디렉토리 확인
  echo ""
  echo "📚 문서 디렉토리 확인 중..."
  if [ ! -d "docs" ]; then
      echo "📁 docs 디렉토리 생성 중..."
      mkdir -p docs/company docs/customer docs/product docs/technical
      cat > docs/company/about.md << 'EOF'
# 회사 소개
우리의 비전은 혁신적인 AI 기술로 더 나은 세상을 만들어가는 것입니다.
EOF
      cat > docs/customer/support.md << 'EOF'
# 고객 지원
문의는 support@company.com으로 보내주세요.
EOF
      echo "✅ 예시 문서가 생성되었습니다."
  else
      echo "✅ docs 디렉토리가 존재합니다."
  fi

  # 5. 권한 설정
  echo ""
  echo "🔐 실행 권한 설정 중..."
  chmod +x dist/index.js

  # 6. 설치 완료 및 클라이언트 설정 안내
  echo ""
  echo "🎉 설치 완료! 이제 클라이언트를 설정하여 서버를 시작할 수 있습니다."
  echo "==============================================================="
  echo ""
  echo "💡 클라이언트 연결 방법 (Claude Desktop 기준):"
  echo "   1. Claude Desktop의 MCP 서버 설정 파일을 엽니다."
  echo "      - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
  echo "      - Windows: %APPDATA%\Claude\claude_desktop_config.json"
  echo ""
  echo "   2. 'mcpServers' 항목에 다음 내용을 추가하거나 수정합니다."
  echo "      'knowledge-retrieval' 서버가 이미 있다면 내용을 아래 설정으로 교체하세요."
  echo ""
  echo '   "knowledge-retrieval": {'
  echo "     \"command\": \"/bin/bash\","
  echo "     \"args\": [\"$SCRIPT_DIR/run.sh\", \"--no-install\"],"
  echo "     \"cwd\": \"$SCRIPT_DIR\""
  echo '   }'
  echo ""
  echo "   - 중요: 위 설정은 이 스크립트('run.sh')를 직접 실행하여 서버를 시작합니다."
  echo "   - '--no-install' 인자는 매번 의존성을 재설치하는 것을 방지합니다."
  echo ""
  echo "   3. Claude Desktop을 재시작하면 클라이언트가 서버를 자동으로 시작합니다."
  echo ""
  echo "✨ 직접 서버를 실행하려면 터미널에서 './run.sh --no-install' 또는 'npm start'를 실행하세요."
  echo ""
  exit 0
fi

# --- 서버 실행 (SERVER_ONLY=true 일 때) ---
# 클라이언트 또는 사용자가 '--no-install' 옵션으로 실행할 때 이 부분이 실행됩니다.

# 환경변수 설정 (개발용 로깅 비활성화)
export NODE_ENV=${NODE_ENV:-production}

# MCP 서버 시작 (npm을 거치지 않고 직접 실행)
exec node "$SCRIPT_DIR/dist/index.js"
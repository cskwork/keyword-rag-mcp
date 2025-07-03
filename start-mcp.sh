#!/bin/bash

# MCP 서버 빌드 및 시작 스크립트
cd "/Users/danny/Documents/Git/MyDocGPT"

echo "🔨 Building MCP server..."
npm run build

# 빌드가 성공했는지 확인
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# dist/index.js에 실행 권한 부여
echo "🔐 Adding execute permission to dist/index.js..."
chmod +x dist/index.js

# 환경변수 설정
export DOCS_BASE_PATH="/Users/danny/Documents/Git/MyDocGPT/docs"

# MCP 서버 시작
echo "🚀 Starting MCP server..."
npm start
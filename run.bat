@echo off
setlocal enabledelayedexpansion

REM MCP Knowledge Retrieval Server - 자동 설치 및 실행 스크립트
REM Auto Install and Run Script for MCP Knowledge Retrieval Server

echo 🚀 MCP Knowledge Retrieval Server 자동 설치 및 실행
echo ================================================

REM 현재 디렉토리 확인
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
echo 📁 작업 디렉토리: %SCRIPT_DIR%

REM Node.js 버전 확인
echo.
echo 🔍 Node.js 버전 확인 중...
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js가 설치되지 않았습니다. Node.js 18 이상을 설치해주세요.
    echo    다운로드: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VERSION=%%a
for /f "tokens=1 delims=." %%a in ("!NODE_VERSION!") do set MAJOR_VERSION=%%a
if !MAJOR_VERSION! LSS 18 (
    echo ❌ Node.js 18 이상이 필요합니다. 현재 버전: !NODE_VERSION!
    pause
    exit /b 1
)
echo ✅ Node.js 버전: !NODE_VERSION!

REM npm 버전 확인
for /f "tokens=*" %%a in ('npm -v') do set NPM_VERSION=%%a
echo ✅ npm 버전: !NPM_VERSION!

REM 1. 의존성 설치
echo.
echo 📦 의존성 설치 중...
call npm install
if errorlevel 1 (
    echo ❌ 의존성 설치 실패!
    pause
    exit /b 1
)

REM 2. 프로젝트 빌드
echo.
echo 🔨 프로젝트 빌드 중...
call npm run build
if errorlevel 1 (
    echo ❌ 빌드 실패!
    pause
    exit /b 1
)

REM 3. 설정 파일 생성 (존재하지 않는 경우)
echo.
echo ⚙️  설정 파일 확인 중...
if not exist "config.json" (
    echo 📝 config.json 파일 생성 중...
    copy "config.example.json" "config.json" >nul
    if errorlevel 1 (
        echo ❌ 설정 파일 생성 실패!
        pause
        exit /b 1
    )
    echo ✅ config.json 파일이 생성되었습니다.
) else (
    echo ✅ config.json 파일이 이미 존재합니다.
)

REM 4. docs 디렉토리 확인
echo.
echo 📚 문서 디렉토리 확인 중...
if not exist "docs" (
    echo 📁 docs 디렉토리 생성 중...
    mkdir docs\company docs\customer docs\product docs\technical
    
    REM 예시 문서 생성
    (
        echo # 회사 소개
        echo.
        echo ## 우리의 비전
        echo 혁신적인 AI 기술로 더 나은 세상을 만들어갑니다.
        echo.
        echo ## 우리의 미션
        echo 고객에게 최고의 가치를 제공하는 것이 우리의 사명입니다.
    ) > docs\company\about.md
    
    (
        echo # 고객 지원
        echo.
        echo ## 문의 방법
        echo - 이메일: support@company.com
        echo - 전화: 1588-0000
        echo - 채팅: 웹사이트 우측 하단
        echo.
        echo ## 운영 시간
        echo 평일 오전 9시 - 오후 6시
    ) > docs\customer\support.md
    
    echo ✅ 예시 문서가 생성되었습니다.
) else (
    echo ✅ docs 디렉토리가 존재합니다.
)

REM 5. 서버 실행 준비
echo.
echo 🎉 설치 완료! MCP 서버를 시작합니다...
echo ================================================
echo.
echo 💡 Claude Desktop 설정 방법:
echo    1. Claude Desktop 설정 파일 열기:
echo       - Windows: %%APPDATA%%\Claude\claude_desktop_config.json
echo.
echo    2. 다음 설정 추가:
echo    {
echo      "mcpServers": {
echo        "knowledge-retrieval": {
echo          "command": "npm",
echo          "args": ["start"],
echo          "cwd": "%SCRIPT_DIR%"
echo        }
echo      }
echo    }
echo.
echo    3. Claude Desktop 재시작
echo.
echo 🚀 서버 시작 중...
echo    중단하려면 Ctrl+C를 누르세요.
echo.

REM 환경변수 설정
set NODE_ENV=production

REM MCP 서버 시작
call npm start

pause
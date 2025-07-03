# 배포 가이드

## 사전 준비사항
### 시스템 요구사항
- **운영체제**: Ubuntu 20.04 LTS 이상
- **CPU**: 최소 4코어 (권장 8코어)
- **메모리**: 최소 8GB (권장 16GB)
- **스토리지**: SSD 100GB 이상
- **네트워크**: 1Gbps 이상

### 필수 소프트웨어
- Docker 20.10 이상
- Docker Compose 2.0 이상
- Node.js 18 이상
- PostgreSQL 14 이상
- Redis 6 이상

## Docker를 이용한 배포
### 1. 프로젝트 클론
```bash
git clone https://github.com/company/project.git
cd project
```

### 2. 환경변수 설정
```bash
cp .env.example .env
```

**.env 파일 예시**
```
# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=myuser
DB_PASSWORD=mypassword

# Redis 설정
REDIS_URL=redis://localhost:6379

# JWT 설정
JWT_SECRET=your-secret-key

# 서버 설정
PORT=3000
NODE_ENV=production
```

### 3. Docker Compose 실행
```bash
docker-compose up -d
```

### 4. 데이터베이스 마이그레이션
```bash
docker-compose exec app npm run migrate
```

### 5. 초기 데이터 설정
```bash
docker-compose exec app npm run seed
```

## Kubernetes 배포
### 네임스페이스 생성
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
```

### ConfigMap 설정
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: myapp
data:
  NODE_ENV: "production"
  PORT: "3000"
```

### Secret 설정
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: myapp
type: Opaque
data:
  DB_PASSWORD: <base64-encoded-password>
  JWT_SECRET: <base64-encoded-secret>
```

### Deployment 설정
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: myapp:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
```

## CI/CD 파이프라인
### GitHub Actions 워크플로우
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      
    - name: Build Docker image
      run: docker build -t myapp:${{ github.sha }} .
      
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/app app=myapp:${{ github.sha }}
        kubectl rollout status deployment/app
```

## 모니터링 설정
### Prometheus 설정
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'app'
    static_configs:
      - targets: ['app:3000']
```

### Grafana 대시보드
- CPU/메모리 사용률
- 응답 시간
- 오류율
- 활성 사용자 수

## 백업 및 복구
### 데이터베이스 백업
```bash
# 매일 자동 백업
0 2 * * * pg_dump myapp > /backup/myapp_$(date +\%Y\%m\%d).sql
```

### 복구 절차
```bash
# 백업에서 복구
psql myapp < /backup/myapp_20240115.sql
```
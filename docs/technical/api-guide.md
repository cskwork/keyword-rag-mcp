# API 가이드

## 인증
### API 키 발급
1. 개발자 포털에 로그인
2. "API 키 관리" 메뉴 선택
3. "새 API 키 생성" 클릭
4. API 키 이름 입력 후 생성

### 요청 헤더
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

## 공통 응답 형식
### 성공 응답
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 오류 응답
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "요청 파라미터가 올바르지 않습니다",
    "details": "email 필드는 필수입니다"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 사용자 관리 API
### 사용자 목록 조회
```
GET /api/v1/users
```

**쿼리 파라미터**
- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 20, 최대: 100)
- `search`: 검색 키워드

**응답 예시**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "email": "user@example.com",
        "name": "홍길동",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### 사용자 생성
```
POST /api/v1/users
```

**요청 본문**
```json
{
  "email": "user@example.com",
  "name": "홍길동",
  "password": "securePassword123"
}
```

### 사용자 정보 수정
```
PUT /api/v1/users/{id}
```

### 사용자 삭제
```
DELETE /api/v1/users/{id}
```

## AI 모델 API
### 텍스트 분류
```
POST /api/v1/ai/classify
```

**요청 본문**
```json
{
  "text": "분석할 텍스트 내용",
  "model": "sentiment-analysis"
}
```

**응답 예시**
```json
{
  "success": true,
  "data": {
    "prediction": "positive",
    "confidence": 0.87,
    "categories": [
      {"label": "positive", "score": 0.87},
      {"label": "negative", "score": 0.13}
    ]
  }
}
```

## 오류 코드
| 코드 | 설명 |
|------|------|
| INVALID_API_KEY | API 키가 유효하지 않음 |
| RATE_LIMIT_EXCEEDED | 요청 한도 초과 |
| INVALID_REQUEST | 잘못된 요청 형식 |
| RESOURCE_NOT_FOUND | 리소스를 찾을 수 없음 |
| INTERNAL_SERVER_ERROR | 서버 내부 오류 |

## 요청 제한
- **일반 계정**: 시간당 1,000회
- **프리미엄 계정**: 시간당 10,000회
- **엔터프라이즈**: 제한 없음
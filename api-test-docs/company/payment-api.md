# Payment API Documentation

## 개요
결제 API 엔드포인트와 인증 방법을 설명하는 문서입니다.

## 인증 (Authentication)
모든 API 요청은 Authorization 헤더에 유효한 API 키가 필요합니다.

## 엔드포인트
- POST /api/payments - 새 결제 생성
- GET /api/payments/{id} - 결제 상세 정보 조회
- PUT /api/payments/{id} - 결제 상태 업데이트

## 오류 처리
API는 표준 HTTP 상태 코드와 상세한 오류 메시지를 반환합니다.
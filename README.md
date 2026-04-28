# Kronex Matching Server

개발기간: 2025년 6월 ~ 2026년 3월

개발인원: 1인 개발

> Kronex 모의 주식 거래소의 주문 매칭 서버입니다.

## Flow

RabbitMQ에서 주문 메시지 수신 → 주문 유형에 따라 처리 (매수/매도/정정/취소) → DB 트랜잭션 내 매칭 엔진 실행 → 체결 결과를 RabbitMQ로 발행

## Architecture

- System

    <img width="921" height="425" alt="image(3)" src="https://github.com/user-attachments/assets/895e4dfd-9038-4281-be77-3363866a24ce" />

- ERD

    <img width="872" height="975" alt="image(4)" src="https://github.com/user-attachments/assets/a3659c97-4f8a-403a-8aed-2a879bd02bcf" />

## Matching Engine

주문이 수신되면 반대편 주문을 탐색하여 아래 세 가지 케이스로 체결합니다.

| 케이스          | 설명                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| Equal Match     | 제출 주문과 상대 주문의 수량이 동일 → 양쪽 완전 체결                         |
| Remaining Match | 제출 주문 수량 < 상대 주문 수량 → 제출 주문 완전 체결, 상대 주문 부분 체결   |
| Partial Match   | 제출 주문 수량 > 상대 주문 수량 → 상대 주문 완전 체결 후 다음 주문 탐색 반복 |

- 지정가 매수: 주문 가격 이하의 매도 주문 중 가장 낮은 가격 순으로 체결
- 지정가 매도: 주문 가격 이상의 매수 주문 중 가장 높은 가격 순으로 체결
- 시장가: 가격 조건 없이 즉시 체결, 미체결 수량은 자동 취소

## Stack

- Language: TypeScript
- Framework: NestJS
- Database: MySQL (Prisma ORM)
- Message Queue: RabbitMQ

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL
- RabbitMQ

### Installation

```bash
git clone https://github.com/kangbaek324/stock-exchange-matching-server.git
cd stock-exchange-matching-server
npm install
```

### Environment Variables

루트 디렉토리에 `.env` 파일을 생성하고 아래 변수를 설정하세요.

```env
SERVER_PORT=

DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DB_NAME

RABBITMQ_URL=amqp://USER:PASSWORD@HOST:PORT
```

### Run

```bash
# 개발 모드
npm run start:dev

# 프로덕션
npm run build
npm run start:prod
```

## Repository

Backend Server <a href="https://github.com/KRONEX-Stock-Exchange/stock-exchange-backend">here</a>

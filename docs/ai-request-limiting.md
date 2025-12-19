# AI Request Limiting System

Hệ thống giới hạn số lần sử dụng AI requests theo gói subscription.

## 📋 Tổng quan

Hệ thống này giới hạn số lần user có thể sử dụng các AI services dựa trên gói subscription của họ. Các AI services được tính:

1. **Clean Dataset** (POST `/api/ai/clean`, `/api/ai/clean-excel`, `/api/ai/clean-async`, `/api/ai/clean-excel-async`)
2. **Evaluate Chart** (POST `/api/ai/evaluate-chart`)
3. **Forecast** (POST `/api/ai/forecast`)
4. **Forecast Analysis** (POST `/api/forecasts/:id/analyze`)

## 🏗️ Kiến trúc

### 1. Database Schema

- Trường `aiRequestsCount` trong bảng `User` để lưu số lượt đã sử dụng
- Trường `limits` (JSON) trong bảng `SubscriptionPlan` chứa `maxAiRequests`

### 2. Components

#### AiRequestService (`src/modules/ai/ai-request.service.ts`)

- `checkAiRequestLimit(userId)`: Kiểm tra xem user có vượt giới hạn không
- `incrementAiRequestCount(userId)`: Tăng số lượt đã sử dụng
- `resetAllAiRequestCounts()`: Reset tất cả user về 0 (gọi bởi cronjob)
- `getAiRequestStatus(userId)`: Lấy thông tin hiện tại

#### AiRequestGuard (`src/modules/ai/guards/ai-request.guard.ts`)

Guard áp dụng cho các AI endpoints:

- Kiểm tra giới hạn trước khi thực hiện
- Tự động tăng count sau khi kiểm tra thành công
- Throw `TOO_MANY_REQUESTS` (429) nếu vượt giới hạn

#### AiRequestCronService (`src/modules/ai/ai-request-cron.service.ts`)

Cronjob reset count hàng ngày:

- Chạy lúc 00:00 mỗi ngày (timezone: Asia/Ho_Chi_Minh)
- Reset tất cả `aiRequestsCount` về 0

## 📊 Giới hạn theo gói

| Plan       | AI Requests/Day |
| ---------- | --------------- |
| Free       | 10              |
| Basic      | 50              |
| Pro        | 200             |
| Enterprise | 1000            |

## 🚀 Setup

### 1. Cài đặt dependencies

```bash
cd BE_WEB
npm install @nestjs/schedule
```

### 2. Chạy migration để cập nhật subscription plans

```bash
npx ts-node prisma/scripts/update-subscription-limits.ts
```

### 3. Khởi động server

```bash
npm run start:dev
```

Cronjob sẽ tự động chạy khi server khởi động.

## 📡 API Endpoints

### Check AI Request Status

```http
GET /api/ai/request-status
Authorization: Bearer <token>
```

**Response:**

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "currentCount": 5,
    "maxLimit": 50,
    "remaining": 45
  }
}
```

### AI Endpoints (tự động check limit)

Tất cả các endpoint sau sẽ tự động check và increment count:

- `POST /api/ai/clean`
- `POST /api/ai/clean-excel`
- `POST /api/ai/clean-async`
- `POST /api/ai/clean-excel-async`
- `POST /api/ai/evaluate-chart`
- `POST /api/ai/forecast`
- `POST /api/forecasts/:id/analyze`

**Error Response khi vượt giới hạn:**

```json
{
  "statusCode": 429,
  "message": "You have reached your daily AI request limit (50 requests). Please upgrade your plan or wait until tomorrow.",
  "currentCount": 50,
  "maxLimit": 50,
  "code": "AI_LIMIT_EXCEEDED"
}
```

## 🧪 Testing

### Test manually

1. **Kiểm tra status hiện tại:**

```bash
curl -X GET http://localhost:3000/api/ai/request-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. **Gọi AI endpoint để tăng count:**

```bash
curl -X POST http://localhost:3000/api/ai/evaluate-chart \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chartId": "your-chart-id",
    "chartImage": "base64-image-data"
  }'
```

3. **Kiểm tra lại status (count đã tăng):**

```bash
curl -X GET http://localhost:3000/api/ai/request-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test cronjob reset

Để test cronjob mà không cần đợi đến nửa đêm, bạn có thể:

1. Tạm thời đổi cron expression trong `ai-request-cron.service.ts`:

```typescript
@Cron('*/1 * * * *') // Chạy mỗi phút
async handleDailyReset() {
  // ...
}
```

2. Hoặc gọi trực tiếp service method:

```typescript
// Trong controller hoặc test
await this.aiRequestService.resetAllAiRequestCounts();
```

## 🔧 Configuration

### Thay đổi timezone cho cronjob

Edit `src/modules/ai/ai-request-cron.service.ts`:

```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
  name: 'reset-ai-request-counts',
  timeZone: 'Asia/Bangkok', // Đổi timezone
})
```

### Thay đổi giới hạn cho gói subscription

Edit `prisma/scripts/update-subscription-limits.ts` và chạy lại:

```bash
npx ts-node prisma/scripts/update-subscription-limits.ts
```

## 📝 Notes

- Count được reset về 0 mỗi ngày lúc 00:00
- User không có subscription plan sẽ có giới hạn mặc định: 10 requests/day
- Các endpoint không phải AI (như chart create, dataset upload) không bị tính vào limit
- Guard chỉ áp dụng cho authenticated users (cần JWT token)

## 🐛 Troubleshooting

### Cronjob không chạy

- Kiểm tra xem `ScheduleModule` đã được import trong `app.module.ts`
- Xem logs khi server start: "Starting daily AI request count reset..."

### Count không tăng

- Kiểm tra xem `AiRequestGuard` đã được thêm vào endpoint chưa
- Kiểm tra xem user đã authenticated chưa (JWT token hợp lệ)

### Limit không đúng

- Kiểm tra subscription plan limits trong database
- Chạy lại migration script để cập nhật limits

## 📚 Tham khảo

- [NestJS Schedule](https://docs.nestjs.com/techniques/task-scheduling)
- [Prisma JSON fields](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields)
- [NestJS Guards](https://docs.nestjs.com/guards)

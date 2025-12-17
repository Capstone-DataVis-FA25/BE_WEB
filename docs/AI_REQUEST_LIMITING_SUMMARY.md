# AI Request Limiting Implementation - Summary

## ✅ Đã hoàn thành

Hệ thống giới hạn số lần sử dụng AI request theo gói subscription đã được implement thành công.

## 📁 Files đã tạo mới

### Backend Services

1. **`src/modules/ai/ai-request.service.ts`**
   - Service quản lý việc check, increment, và reset AI request count
   - Methods: `checkAiRequestLimit`, `incrementAiRequestCount`, `resetAllAiRequestCounts`, `getAiRequestStatus`

2. **`src/modules/ai/guards/ai-request.guard.ts`**
   - Guard tự động check giới hạn và increment count khi user gọi AI endpoints
   - Throw error 429 (TOO_MANY_REQUESTS) nếu vượt giới hạn

3. **`src/modules/ai/ai-request-cron.service.ts`**
   - Cronjob tự động reset count về 0 mỗi ngày lúc 00:00 (timezone: Asia/Ho_Chi_Minh)

### Type Definitions

4. **`src/types/subscription-limits.ts`**
   - Interface cho subscription plan limits
   - Examples cho từng gói: Free, Basic, Pro, Enterprise

### Scripts & Documentation

5. **`prisma/scripts/update-subscription-limits.ts`**
   - Migration script để cập nhật subscription plans với AI request limits

6. **`docs/ai-request-limiting.md`**
   - Tài liệu đầy đủ về cách hoạt động, setup, và testing

## 📝 Files đã cập nhật

1. **`src/modules/ai/ai.module.ts`**
   - Import và register: AiRequestService, AiRequestCronService, AiRequestGuard
   - Export để các module khác có thể sử dụng

2. **`src/modules/ai/ai.controller.ts`**
   - Thêm `@UseGuards(AiRequestGuard)` cho các AI endpoints:
     - `/ai/clean`, `/ai/clean-excel`
     - `/ai/clean-async`, `/ai/clean-excel-async`
     - `/ai/evaluate-chart`
     - `/ai/forecast`
   - Thêm endpoint mới: `GET /ai/request-status` để check count hiện tại

3. **`src/modules/forecasts/forecasts.controller.ts`**
   - Import AiRequestGuard
   - Thêm guard cho endpoint `/forecasts/:id/analyze`

4. **`src/app.module.ts`**
   - Import `ScheduleModule.forRoot()` để enable cronjob

## 🎯 Các AI Endpoints được giới hạn

1. **Clean Dataset**
   - POST `/api/ai/clean`
   - POST `/api/ai/clean-excel`
   - POST `/api/ai/clean-async`
   - POST `/api/ai/clean-excel-async`

2. **Evaluate Chart**
   - POST `/api/ai/evaluate-chart`

3. **Forecast**
   - POST `/api/ai/forecast`
   - POST `/api/forecasts/:id/analyze`

## 📊 Giới hạn theo gói

| Subscription Plan | AI Requests/Day |
| ----------------- | --------------- |
| Free (Default)    | 10              |
| Basic             | 50              |
| Pro               | 200             |
| Enterprise        | 1000            |

## 🚀 Cách sử dụng

### 1. Cài đặt dependency

```bash
npm install @nestjs/schedule
```

### 2. Chạy migration

```bash
npx ts-node prisma/scripts/update-subscription-limits.ts
```

### 3. Khởi động server

```bash
npm run start:dev
```

### 4. Test API

**Check AI request status:**

```bash
curl -X GET http://localhost:3000/api/ai/request-status \
  -H "Authorization: Bearer YOUR_TOKEN"
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

**Khi vượt giới hạn:**

```json
{
  "statusCode": 429,
  "message": "You have reached your daily AI request limit (50 requests). Please upgrade your plan or wait until tomorrow.",
  "currentCount": 50,
  "maxLimit": 50,
  "code": "AI_LIMIT_EXCEEDED"
}
```

## ⏰ Cronjob Schedule

- **Reset count:** Mỗi ngày lúc 00:00 (Asia/Ho_Chi_Minh timezone)
- **Logging:** Mỗi giờ (optional, có thể disable)

## 🔍 Cách hoạt động

1. **Khi user gọi AI endpoint:**
   - `AiRequestGuard` được trigger
   - Check xem user đã vượt giới hạn chưa
   - Nếu OK: increment count và cho phép request tiếp tục
   - Nếu vượt: throw error 429

2. **Mỗi ngày lúc 00:00:**
   - `AiRequestCronService` tự động chạy
   - Reset `aiRequestsCount = 0` cho tất cả users
   - Log số lượng users đã được reset

3. **Check limit dựa trên:**
   - User's subscription plan (nếu có)
   - Field `limits.maxAiRequests` trong subscription plan
   - Default: 10 requests/day nếu không có plan

## 📌 Lưu ý

- Count được lưu trong field `aiRequestsCount` của User model (đã có sẵn trong schema)
- Limits được lưu trong field `limits` (JSON) của SubscriptionPlan model
- Guard chỉ áp dụng cho authenticated users (cần JWT token)
- Cronjob tự động chạy khi server start, không cần config thêm

## 🎉 Kết quả

Hệ thống đã hoàn chỉnh và sẵn sàng sử dụng! Tất cả AI requests giờ đây sẽ được tính và giới hạn theo gói subscription của user.

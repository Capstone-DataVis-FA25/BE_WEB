# 🧪 Test LSTM Prediction API

## 📋 Yêu cầu
- Server đã chạy: `npm run start:dev`
- Model đã load: Check endpoint `/prediction/model-info`
- Token authentication (nếu có)

## 1️⃣ Kiểm tra Model Status

```bash
curl http://localhost:3000/prediction/model-info
```

**Expected Response:**
```json
{
  "loaded": true,
  "modelExists": true,
  "preprocessorExists": true,
  "preprocessor": {
    "scaler_y_min": 1,
    "scaler_y_max": 80995
  },
  "inputNames": ["input"],
  "outputNames": ["output"],
  "message": "ONNX model loaded and ready for inference"
}
```

## 2️⃣ Test Prediction với dữ liệu thật

### Ví dụ 1: Dự đoán 1 bước tiếp theo
```bash
curl -X POST http://localhost:3000/prediction/quantity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "historicalData": [1000, 1200, 1500, 1800, 2000, 2200, 2500],
    "steps": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "predictions": [2750],
  "metadata": {
    "inputLength": 7,
    "steps": 1,
    "scaler_min": 1,
    "scaler_max": 80995
  }
}
```

### Ví dụ 2: Dự đoán 7 ngày tiếp theo
```bash
curl -X POST http://localhost:3000/prediction/quantity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "historicalData": [
      5000, 5200, 4800, 5100, 5300, 
      5400, 5600, 5800, 6000, 6200,
      6100, 6300, 6500, 6700
    ],
    "steps": 7
  }'
```

**Response:**
```json
{
  "success": true,
  "predictions": [6850, 7000, 7150, 7300, 7450, 7600, 7750],
  "metadata": {
    "inputLength": 14,
    "steps": 7,
    "scaler_min": 1,
    "scaler_max": 80995
  }
}
```

### Ví dụ 3: Dữ liệu bán hàng thực tế (30 ngày)
```bash
curl -X POST http://localhost:3000/prediction/quantity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "historicalData": [
      1200, 1300, 1250, 1400, 1500,
      1450, 1600, 1700, 1650, 1800,
      1900, 2000, 1950, 2100, 2200,
      2150, 2300, 2400, 2350, 2500,
      2600, 2550, 2700, 2800, 2750,
      2900, 3000, 2950, 3100, 3200
    ],
    "steps": 14
  }'
```

## 3️⃣ Test với Postman

### Setup:
1. **URL:** `POST http://localhost:3000/prediction/quantity`
2. **Headers:**
   ```
   Content-Type: application/json
   Authorization: Bearer YOUR_TOKEN
   ```
3. **Body (raw JSON):**
   ```json
   {
     "historicalData": [1000, 1200, 1500, 1800, 2000],
     "steps": 3
   }
   ```

## 4️⃣ Test với JavaScript/TypeScript

```typescript
async function predictQuantity(historicalData: number[], steps: number = 7) {
  const response = await fetch('http://localhost:3000/prediction/quantity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourToken}`,
    },
    body: JSON.stringify({
      historicalData,
      steps,
    }),
  });

  const result = await response.json();
  console.log('Predictions:', result.predictions);
  return result;
}

// Sử dụng
const data = [5000, 5500, 6000, 6500, 7000, 7500, 8000];
predictQuantity(data, 7);
```

## 5️⃣ Test với Python

```python
import requests
import json

def predict_quantity(historical_data, steps=7, token=None):
    url = 'http://localhost:3000/prediction/quantity'
    headers = {
        'Content-Type': 'application/json',
    }
    
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    payload = {
        'historicalData': historical_data,
        'steps': steps
    }
    
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# Sử dụng
data = [1000, 1200, 1500, 1800, 2000, 2200, 2500]
result = predict_quantity(data, steps=5)
print(f"Predictions: {result['predictions']}")
```

## 6️⃣ Swagger UI

Truy cập: **http://localhost:3000/api-docs**

1. Tìm section **"prediction"**
2. Expand endpoint **POST /prediction/quantity**
3. Click **"Try it out"**
4. Nhập dữ liệu test:
   ```json
   {
     "historicalData": [1000, 1200, 1500, 1800, 2000],
     "steps": 3
   }
   ```
5. Click **"Execute"**

## 📊 Hiểu Output

### Predictions Array
- Mảng các giá trị dự đoán cho từng bước
- Ví dụ: `[2750, 3000, 3250]` = dự đoán cho 3 ngày tiếp theo

### Metadata
- `inputLength`: Số lượng điểm dữ liệu đầu vào
- `steps`: Số bước dự đoán
- `scaler_min/max`: Giá trị min/max từ training data

## 🔍 Troubleshooting

### Lỗi: "ONNX model not loaded"
```bash
# Kiểm tra file model
ls src/model/

# Khởi động lại server
npm run start:dev
```

### Lỗi: "Preprocessor not loaded"
```bash
# Kiểm tra file preprocessor.json
cat src/model/preprocessor.json

# Đảm bảo có đúng format:
# {"scaler_y_min": 1.0, "scaler_y_max": 80995.0}
```

### Lỗi: "Historical data required"
- Đảm bảo `historicalData` là array of numbers
- Tối thiểu 1 giá trị

### Prediction không chính xác
- Model cần ít nhất 7-30 điểm dữ liệu để dự đoán tốt
- Dữ liệu đầu vào nên có xu hướng rõ ràng
- Kiểm tra scaler_min/max có khớp với training không

## 💡 Tips

1. **Độ dài input tốt nhất:** 14-30 điểm dữ liệu
2. **Số steps hợp lý:** 1-14 bước
3. **Data quality:** Dữ liệu đầu vào nên có pattern/trend
4. **Normalization:** Model tự động normalize dựa trên preprocessor.json

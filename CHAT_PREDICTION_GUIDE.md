# 💬 Chat Prediction - Dự đoán bằng ngôn ngữ tự nhiên

## 🎯 Tính năng

Chat với AI để dự đoán doanh số chỉ bằng câu nói tự nhiên. AI sẽ:
1. ✅ Trích xuất dữ liệu số từ prompt của bạn
2. ✅ Phân tích xu hướng
3. ✅ Dự đoán số lượng ngày tiếp theo
4. ✅ Trả về câu trả lời tự nhiên dễ hiểu

## 🚀 API Endpoint

### POST /prediction/chat

## 📝 Request Format

```json
{
  "prompt": "Trong 7 ngày qua, doanh số hàng ngày là: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán doanh số ngày mai.",
  "language": "vi"
}
```

## 📊 Response Format

```json
{
  "success": true,
  "message": "📊 **Phân tích dữ liệu bán hàng**\n\nDữ liệu: doanh số hàng ngày\nThời gian: 7 ngày\n\n📈 **Dự đoán cho ngày 2024-12-07:**\n→ Số lượng dự kiến: **2,750 đơn vị**\n\n📉 **Phân tích xu hướng:**\n→ Xu hướng: **TĂNG** 📈 (+15.2%)\n→ Độ tin cậy: **Cao ✅**\n\n📊 **Thống kê:**\n→ Trung bình: 1,743 đơn vị\n→ Cao nhất: 2,500 đơn vị\n→ Thấp nhất: 1,000 đơn vị",
  "prediction": {
    "nextDayPrediction": 2750,
    "nextDate": "2024-12-07",
    "confidence": "high",
    "trend": "increasing",
    "trendPercent": 15.2
  },
  "extractedData": {
    "quantities": [1000, 1200, 1500, 1800, 2000, 2200, 2500],
    "dates": ["2024-12-01", "2024-12-02", "2024-12-03", "2024-12-04", "2024-12-05", "2024-12-06", "2024-12-07"],
    "count": 7
  },
  "statistics": {
    "mean": 1743,
    "stdDev": 548,
    "min": 1000,
    "max": 2500
  }
}
```

## 💬 Ví dụ Prompt

### Ví dụ 1: Đơn giản nhất
```
Prompt: "Doanh số 7 ngày: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?"
```

### Ví dụ 2: Có ngày tháng
```
Prompt: "Từ 1/12 đến 7/12, doanh số là: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Ngày 8/12 sẽ bán được bao nhiêu?"
```

### Ví dụ 3: Mô tả chi tiết
```
Prompt: "Cửa hàng của tôi trong tuần vừa rồi bán được: ngày 1 bán 1000 sản phẩm, ngày 2 bán 1200, ngày 3 bán 1500, ngày 4 bán 1800, ngày 5 bán 2000, ngày 6 bán 2200, ngày 7 bán 2500. Hãy dự đoán ngày mai sẽ bán được bao nhiêu?"
```

### Ví dụ 4: Dữ liệu nhiều ngày
```
Prompt: "Dữ liệu bán hàng 14 ngày qua: 5000, 5200, 4800, 5100, 5300, 5400, 5600, 5800, 6000, 6200, 6100, 6300, 6500, 6700. Dự đoán cho ngày tiếp theo?"
```

### Ví dụ 5: Tiếng Anh
```json
{
  "prompt": "Last 7 days sales: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Predict tomorrow?",
  "language": "en"
}
```

## 🧪 Test với CURL

### Tiếng Việt:
```bash
curl -X POST http://localhost:3000/prediction/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "prompt": "Trong 7 ngày qua, doanh số hàng ngày là: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán doanh số ngày mai.",
    "language": "vi"
  }'
```

### Tiếng Anh:
```bash
curl -X POST http://localhost:3000/prediction/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "prompt": "Sales for the last 7 days: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Predict tomorrow.",
    "language": "en"
  }'
```

## 🎨 Test với Postman

1. **Method**: `POST`
2. **URL**: `http://localhost:3000/prediction/chat`
3. **Headers**:
   ```
   Content-Type: application/json
   Authorization: Bearer YOUR_TOKEN
   ```
4. **Body (raw JSON)**:
   ```json
   {
     "prompt": "Doanh số 7 ngày: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?",
     "language": "vi"
   }
   ```

## 🎨 Test với Swagger UI

1. Truy cập: `http://localhost:3000/api-docs`
2. Tìm section **"prediction"**
3. Expand **POST /prediction/chat**
4. Click **"Try it out"**
5. Nhập prompt:
   ```json
   {
     "prompt": "Doanh số 7 ngày qua: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán cho ngày mai?",
     "language": "vi"
   }
   ```
6. Click **"Execute"**

## 📋 Các định dạng Prompt được hỗ trợ

### ✅ Cách viết ĐÚNG:

```
✓ "Doanh số: 1000, 1200, 1500"
✓ "7 ngày: 1000, 1200, 1500, 1800, 2000, 2200, 2500"
✓ "Bán được: 1000 (ngày 1), 1200 (ngày 2), 1500 (ngày 3)"
✓ "Tuần vừa rồi: 1000, 1200, 1500, 1800, 2000, 2200, 2500"
✓ "Sales: 1000, 1200, 1500, 1800, 2000"
✓ "Last week: 1k, 1.2k, 1.5k, 1.8k, 2k, 2.2k, 2.5k" (k = nghìn)
```

### ❌ Cách viết SAI:

```
✗ "Doanh số tăng" (không có số liệu cụ thể)
✗ "Bán rất tốt" (không có con số)
✗ "Khoảng 1000-2000" (không rõ ràng)
✗ Chỉ mô tả không có số
```

## 🔍 AI sẽ trích xuất gì?

AI thông minh sẽ tự động:
1. ✅ Tìm tất cả các con số trong prompt
2. ✅ Hiểu các định dạng: "1000", "1,000", "1k", "1.5k"
3. ✅ Sắp xếp theo thứ tự thời gian (nếu có chỉ dẫn)
4. ✅ Tạo ngày tháng tự động nếu không có
5. ✅ Hiểu cả tiếng Việt và tiếng Anh

## 📈 Kết quả trả về

### Message format (Markdown):
- **Tiêu đề**: Phân tích dữ liệu bán hàng
- **Dự đoán**: Số lượng + ngày
- **Xu hướng**: TĂNG/GIẢM/ỔN ĐỊNH với %
- **Độ tin cậy**: Cao/Trung bình/Thấp
- **Thống kê**: Mean, Max, Min

### Prediction object:
- `nextDayPrediction`: Số lượng dự đoán
- `nextDate`: Ngày dự đoán (YYYY-MM-DD)
- `confidence`: high/medium/low
- `trend`: increasing/decreasing/stable
- `trendPercent`: % thay đổi

### Extracted data:
- `quantities`: Mảng số liệu đã trích xuất
- `dates`: Mảng ngày tháng (auto-generated nếu không có)
- `count`: Số lượng điểm dữ liệu

## 💡 Tips

1. **Số liệu rõ ràng**: Càng nhiều số càng chính xác (7-30 ngày)
2. **Thứ tự thời gian**: Nên sắp xếp từ cũ → mới
3. **Ngôn ngữ nhất quán**: Chọn `vi` hoặc `en` phù hợp với prompt
4. **Đơn vị**: Nên ghi rõ đơn vị (đơn vị, sản phẩm, nghìn đồng...)

## 🔧 Xử lý lỗi

### Không trích xuất được dữ liệu:
```json
{
  "success": false,
  "message": "❌ Không thể trích xuất dữ liệu từ prompt. Vui lòng cung cấp dữ liệu số lượng rõ ràng hơn.",
  "extractedData": {
    "success": false,
    "error": "Không tìm thấy dữ liệu số lượng"
  }
}
```

**Giải pháp**: Viết lại prompt với số liệu cụ thể hơn.

## 🎯 So sánh với API khác

| Feature | POST /chat | POST /next-day | POST /quantity |
|---------|-----------|----------------|----------------|
| Input | Prompt tự nhiên | JSON structured | JSON structured |
| Số liệu | Tự động trích xuất | Phải format sẵn | Phải format sẵn |
| Response | Văn bản tự nhiên | JSON technical | JSON technical |
| Dễ dùng | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Chính xác | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Use case | Chat UI, Demo | Production API | Production API |

## 🚀 Integration với Frontend

```typescript
async function chatPredict(prompt: string) {
  const response = await fetch('http://localhost:3000/prediction/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      language: 'vi',
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('AI Message:', result.message);
    console.log('Prediction:', result.prediction.nextDayPrediction);
    console.log('Trend:', result.prediction.trend);
  }
  
  return result;
}

// Sử dụng
const prompt = "Doanh số 7 ngày: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?";
chatPredict(prompt);
```

## 🎨 UI Example (React)

```jsx
function ChatPrediction() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const response = await fetch('/api/prediction/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, language: 'vi' }),
    });
    const data = await response.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div>
      <textarea 
        value={prompt} 
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Nhập dữ liệu doanh số của bạn..."
      />
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Đang dự đoán...' : 'Dự đoán'}
      </button>
      
      {result?.success && (
        <div>
          <ReactMarkdown>{result.message}</ReactMarkdown>
          <div>
            <h3>Dự đoán: {result.prediction.nextDayPrediction} đơn vị</h3>
            <p>Ngày: {result.prediction.nextDate}</p>
            <p>Xu hướng: {result.prediction.trend}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

**Perfect cho**: Chat interface, Demo, User-friendly applications
**Không dùng cho**: High-precision automation, Batch processing

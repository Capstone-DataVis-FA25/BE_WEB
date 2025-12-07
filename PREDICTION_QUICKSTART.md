# 🚀 Quick Start - LSTM Prediction Module

## Bước 1: Export Model sang ONNX

```bash
# Trong thư mục BE_WEB
python export_to_onnx.py
```

**✅ Kết quả:** File `src/model/lstm_quantity_predictor.onnx` được tạo

## Bước 2: Cài đặt ONNX Runtime

```bash
npm install onnxruntime-node
```

## Bước 3: Khởi động Server

```bash
npm run start:dev
```

## Bước 4: Test API

### Kiểm tra model đã load chưa:
```bash
curl http://localhost:3000/prediction/model-info
```

### Thực hiện prediction:
```bash
curl -X POST http://localhost:3000/prediction/quantity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "historicalData": [100, 120, 115, 130, 125, 140, 135],
    "steps": 5
  }'
```

### Response mẫu:
```json
{
  "success": true,
  "predictions": [145, 150, 148, 155, 152],
  "metadata": {
    "inputLength": 7,
    "steps": 5,
    "min": 100,
    "max": 155
  }
}
```

## 🔧 Troubleshooting

### Lỗi: "ONNX model not found"
- Kiểm tra file `src/model/lstm_quantity_predictor.onnx` có tồn tại không
- Chạy lại: `python export_to_onnx.py`

### Lỗi: "Model weights loaded failed"
- Mở `export_to_onnx.py`
- Điều chỉnh CONFIG để khớp với model training:
  ```python
  CONFIG = {
      'hidden_size': 50,    # Khớp với training
      'num_layers': 1,      # Khớp với training
      'input_size': 1,      # Số features
  }
  ```

### Lỗi: "onnxruntime-node not found"
```bash
npm install onnxruntime-node
```

## 📖 API Documentation

Xem chi tiết tại: `src/modules/prediction/README.md`

Hoặc truy cập Swagger: `http://localhost:3000/api-docs`

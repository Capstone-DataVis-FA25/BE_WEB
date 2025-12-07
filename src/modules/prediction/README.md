# Prediction Module - LSTM Quantity Predictor

## Mô tả
Module này sử dụng mô hình LSTM đã được train để dự đoán số lượng (quantity) trong tương lai dựa trên dữ liệu lịch sử.

## Công nghệ
- **Model Format:** ONNX (Open Neural Network Exchange)
- **Runtime:** ONNX Runtime for Node.js
- **Framework:** NestJS + TypeScript

## 🚀 Cài đặt & Setup

### Bước 1: Export PyTorch Model sang ONNX

```bash
# Cài đặt dependencies Python
pip install torch onnx

# Chỉnh sửa config trong export_to_onnx.py (nếu cần)
# Đảm bảo các tham số khớp với model đã train

# Export model
python export_to_onnx.py
```

**Output:** `src/model/lstm_quantity_predictor.onnx`

### Bước 2: Cài đặt ONNX Runtime

```bash
cd BE_WEB
npm install onnxruntime-node
```

### Bước 3: Khởi động server

```bash
npm run start:dev
```

## 📝 Cấu hình Model

Trong file `export_to_onnx.py`, điều chỉnh các tham số để khớp với model đã train:

```python
CONFIG = {
    'input_size': 1,        # Số features (univariate = 1)
    'hidden_size': 50,      # LSTM hidden units
    'num_layers': 1,        # Số lớp LSTM
    'sequence_length': 10,  # Độ dài sequence mặc định
}
```

## API Endpoints

### 1. Predict Quantity
Dự đoán số lượng trong tương lai dựa trên dữ liệu lịch sử.

**Endpoint:** `POST /prediction/quantity`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "historicalData": [100, 120, 115, 130, 125, 140, 135],
  "steps": 7
}
```

**Response:**
```json
{
  "success": true,
  "predictions": [145, 150, 148, 155, 152, 158, 160],
  "metadata": {
    "inputLength": 7,
    "steps": 7,
    "min": 100,
    "max": 160
  }
}
```

### 2. Get Model Info
Lấy thông tin về model đã load.

**Endpoint:** `GET /prediction/model-info`

**Response:**
```json
{
  "loaded": true,
  "inputShape": [null, null, 1],
  "outputShape": [null, 1],
  "layers": 2,
  "trainable": true
}
```

## Test thử

### 1. Test với Swagger UI
Truy cập: `http://localhost:3000/api-docs`
- Tìm section "prediction"
- Thử endpoint POST /prediction/quantity

### 2. Test với curl
```bash
# Get model info
curl -X GET http://localhost:3000/prediction/model-info \
  -H "Authorization: Bearer YOUR_TOKEN"

# Make prediction
curl -X POST http://localhost:3000/prediction/quantity \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "historicalData": [100, 120, 115, 130, 125, 140, 135],
    "steps": 7
  }'
```

### 3. Test với Postman
Import collection hoặc tạo request mới:
- URL: `POST http://localhost:3000/prediction/quantity`
- Headers: `Authorization: Bearer <token>`
- Body (raw JSON):
```json
{
  "historicalData": [100, 120, 115, 130, 125, 140, 135],
  "steps": 7
}
```

## File chuyển đổi model (convert_to_onnx.py)

Tạo file này để chuyển đổi PyTorch model:

```python
import torch
import torch.nn as nn

# Define your LSTM model architecture (phải giống với khi train)
class LSTMPredictor(nn.Module):
    def __init__(self, input_size=1, hidden_size=50, num_layers=1, output_size=1):
        super(LSTMPredictor, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        predictions = self.fc(lstm_out[:, -1, :])
        return predictions

# Load model
model = LSTMPredictor()
model.load_state_dict(torch.load('src/model/lstm_quantity_predictor.pth'))
model.eval()

# Export to ONNX
dummy_input = torch.randn(1, 7, 1)  # [batch_size, sequence_length, features]
torch.onnx.export(
    model, 
    dummy_input, 
    'lstm_quantity_predictor.onnx',
    export_params=True,
    opset_version=11,
    do_constant_folding=True,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={
        'input': {0: 'batch_size', 1: 'sequence_length'},
        'output': {0: 'batch_size'}
    }
)

print("✅ Model exported to ONNX format!")
```

## Lưu ý

1. **Dummy Model:** Hiện tại service đang sử dụng dummy model để test. Cần chuyển đổi model thật để có kết quả chính xác.

2. **Input Shape:** Model cần input có shape `[batch_size, sequence_length, features]`
   - batch_size: số lượng sequences (thường là 1)
   - sequence_length: độ dài chuỗi lịch sử
   - features: số features (thường là 1 cho univariate time series)

3. **Normalization:** Service tự động normalize data bằng min-max scaling trước khi predict.

4. **Performance:** TensorFlow.js Node có performance tốt hơn TensorFlow.js browser version.

## Troubleshooting

### Lỗi: Module '@tensorflow/tfjs-node' not found
```bash
npm install @tensorflow/tfjs-node
```

### Lỗi: Model load failed
- Kiểm tra đường dẫn model trong `prediction.service.ts`
- Đảm bảo model đã được chuyển đổi sang TensorFlow.js format

### Prediction không chính xác
- Kiểm tra input data có đúng format không
- Đảm bảo normalization được áp dụng đúng
- Verify model architecture match với lúc train

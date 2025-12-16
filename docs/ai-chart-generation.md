# AI Chart Generation API Documentation

## 📊 Tổng quan

Hệ thống AI Chart Generation cho phép người dùng tạo biểu đồ tự động thông qua natural language prompts. Hệ thống hỗ trợ 2 cách sử dụng:

1. **Chat AI** - Tương tác qua chatbox, AI sẽ hướng dẫn và tạo chart
2. **Direct Generation** - Gọi trực tiếp API để generate config

---

## 📦 Response Structure Details

### Chat AI Response - needsDatasetSelection

**Structure:**

```typescript
interface ChatAIResponse {
  reply: string; // Markdown formatted message
  success: boolean; // Always true if no error
  needsDatasetSelection: boolean; // true = need to pick dataset
  datasets: Array<{
    // ⭐ ALWAYS present when needsDatasetSelection = true
    id: string; // Dataset UUID
    name: string; // Dataset name
    description: string | null; // Optional description
  }>;
}
```

**Example:**

```json
{
  "reply": "📊 **Chọn dataset để tạo biểu đồ**\n\nBạn có 3 datasets:\n\n1. **Sales Data 2024** - Monthly sales data\n2. **Customer Analytics** - Customer behavior analysis\n3. **Revenue Report** - Q1-Q4 revenue summary",
  "success": true,
  "needsDatasetSelection": true,
  "datasets": [
    {
      "id": "cm4abc123xyz",
      "name": "Sales Data 2024",
      "description": "Monthly sales data"
    },
    {
      "id": "cm4def456uvw",
      "name": "Customer Analytics",
      "description": "Customer behavior analysis"
    },
    {
      "id": "cm4ghi789rst",
      "name": "Revenue Report",
      "description": "Q1-Q4 revenue summary"
    }
  ]
}
```

---

### Chat AI Response - chartGenerated

**Structure:**

```typescript
interface ChartGeneratedResponse {
  reply: string; // Success message with Markdown link
  success: boolean; // Always true
  chartGenerated: boolean; // true = chart created successfully
  chartData: {
    type: string; // Chart type
    config: object; // Full chart configuration
    explanation: string; // AI explanation
    suggestedName: string; // Suggested chart name
    chartUrl: string; // Direct URL to Chart Editor
  };
}
```

**Example:**

```json
{
  "reply": "✅ **Đã tạo biểu đồ thành công!**\n\n📊 **Biểu đồ doanh thu theo tháng**\n\nTôi đã tạo biểu đồ line chart...\n\n🔗 [**Mở Chart Editor →**](/workspace/charts/editor?config=...)",
  "success": true,
  "chartGenerated": true,
  "chartData": {
    "type": "line",
    "config": {
      /* full config */
    },
    "explanation": "Tôi đã tạo line chart với...",
    "suggestedName": "Biểu đồ doanh thu theo tháng",
    "chartUrl": "/workspace/charts/editor?config=eyJ0eXBlIjoibGluZSI..."
  }
}
```

---

## 🎯 Supported Chart Types

| Chart Type  | Use Case                          | Example Prompt                                  |
| ----------- | --------------------------------- | ----------------------------------------------- |
| `line`      | Trends over time, continuous data | "Tạo line chart hiển thị doanh thu theo tháng"  |
| `bar`       | Categorical comparisons           | "So sánh doanh số các chi nhánh bằng bar chart" |
| `area`      | Cumulative trends                 | "Vẽ area chart tích lũy doanh thu"              |
| `pie`       | Part-to-whole relationships       | "Tỷ lệ phần trăm từng sản phẩm bằng pie chart"  |
| `scatter`   | Correlation between variables     | "Scatter plot giữa giá và số lượng bán"         |
| `heatmap`   | Patterns in matrix data           | "Heatmap nhiệt độ theo giờ và ngày"             |
| `histogram` | Data distribution                 | "Histogram phân bố tuổi khách hàng"             |
| `cycleplot` | Seasonal/cyclical patterns        | "Cycleplot xu hướng theo mùa"                   |

---

## 🚀 API Endpoints

### ⭐ WORKFLOW RECOMMENDATION

```
┌─────────────────────────────────────────────────┐
│  User muốn tạo chart                            │
│  ↓                                              │
│  Dùng /chat-with-ai (KHÔNG cần datasetId)      │ ← RECOMMENDED
│  ↓                                              │
│  Backend tự động list datasets                  │
│  ↓                                              │
│  User chọn dataset trong UI                     │
│  ↓                                              │
│  Gọi lại /chat-with-ai với datasetId            │
│  ↓                                              │
│  Generate chart config + trả về link            │
└─────────────────────────────────────────────────┘

⚠️ KHÔNG nên dùng /generate-chart-config trực tiếp
   nếu chưa biết datasetId!
```

---

### 1. Chat with AI (Recommended) ⭐⭐⭐

**Endpoint:** `POST /api/ai/chat-with-ai`

**Use case:**

- ✅ User KHÔNG cần biết datasetId trước
- ✅ Hệ thống TỰ ĐỘNG list datasets để chọn
- ✅ Tích hợp sẵn trong chatbox UI
- ✅ Handle cả flow từ đầu đến cuối

**🎯 Smart Features:**

- ✅ Tự động phát hiện khi user muốn tạo chart
- ✅ Nếu chưa có dataset → Hiển thị danh sách datasets để chọn
- ✅ Nếu đã có dataset → Generate chart config ngay lập tức
- ✅ Trả về link trực tiếp đến Chart Editor

#### Request Body:

```typescript
{
  message: string;           // User's message
  datasetId?: string;        // Optional: Dataset ID if already selected
  messages?: string;         // Optional: Chat history JSON
  language?: string;         // Optional: 'en' | 'vi' | 'auto'
}
```

#### Example 1: KHÔNG CÓ DATASET (Hệ thống tự động hiển thị danh sách)

```bash
curl -X POST http://localhost:3000/api/ai/chat-with-ai \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tạo biểu đồ line chart"
  }'
```

**Response:**

```json
{
  "reply": "📊 **Chọn dataset để tạo biểu đồ**\n\nBạn có 3 datasets:\n\n1. **Sales Data 2024** - Monthly sales data\n2. **Customer Analytics** - Customer behavior analysis\n3. **Revenue Report** - Q1-Q4 revenue summary\n\n💡 Vui lòng chọn dataset từ danh sách trên, sau đó mô tả chi tiết hơn về biểu đồ bạn muốn tạo!",
  "success": true,
  "needsDatasetSelection": true,
  "datasets": [
    {
      "id": "cmfp0xm9v0001193gt2vmnyf4",
      "name": "Sales Data 2024",
      "description": "Monthly sales data"
    },
    {
      "id": "cmfp0xm9v0001193gt2vmnyf5",
      "name": "Customer Analytics",
      "description": "Customer behavior analysis"
    },
    {
      "id": "cmfp0xm9v0001193gt2vmnyf6",
      "name": "Revenue Report",
      "description": "Q1-Q4 revenue summary"
    }
  ]
}
```

**⚠️ QUAN TRỌNG:**

- Frontend PHẢI xử lý `needsDatasetSelection: true` để hiển thị dataset picker
- Sau khi user chọn dataset, gọi lại API với `datasetId` đã chọn

#### Example 2: ĐÃ CÓ DATASET (Generate trực tiếp)

```bash
curl -X POST http://localhost:3000/api/ai/chat-with-ai \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tạo line chart hiển thị doanh thu theo tháng với theme tối và đường cong mượt",
    "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
  }'
```

**Response:**

```json
{
  "reply": "✅ **Đã tạo biểu đồ thành công!**\n\n📊 **Biểu đồ doanh thu theo tháng**\n\nTôi đã tạo biểu đồ line chart với trục X là tháng và trục Y là doanh thu. Theme tối và đường cong mượt được áp dụng theo yêu cầu.\n\n🔗 [**Mở Chart Editor →**](/workspace/charts/editor?config=eyJ0eXBlIjoibGluZSIsImNvbmZpZyI6ey4uLn19)",
  "success": true,
  "chartGenerated": true,
  "chartData": {
    "type": "line",
    "config": {
      "title": "Biểu đồ doanh thu theo tháng",
      "width": 800,
      "height": 400,
      "margin": { "top": 20, "left": 50, "right": 30, "bottom": 40 },
      "theme": "dark",
      "xAxisKey": "cmfp0xm9v0002193gt2vmnyf5",
      "yAxisKeys": ["cmfp0xm9v0003193g971yzucg"],
      "showLegend": true,
      "showGrid": true,
      "lineType": "smooth"
    },
    "explanation": "Tôi đã tạo line chart với trục X là tháng và trục Y là doanh thu...",
    "suggestedName": "Biểu đồ doanh thu theo tháng",
    "chartUrl": "/workspace/charts/editor?config=eyJ0eXBlIjoibGluZSIsImNvbmZpZyI6ey4uLn19"
  }
}
```

---

### 2. Generate Chart Config (Direct) ⚠️

**Endpoint:** `POST /api/ai/generate-chart-config`

**⚠️ IMPORTANT:**

- Endpoint này YÊU CẦU `datasetId` bắt buộc
- KHÔNG dùng endpoint này nếu chưa biết datasetId
- Nên dùng `/chat-with-ai` thay thế để tự động handle dataset selection

**Use case:**

- ✅ Khi đã biết chính xác datasetId
- ✅ Direct API integration (không qua chat)
- ✅ Batch processing charts

**Use case:** Generate chart config trực tiếp khi đã biết dataset

#### Request Body:

```typescript
{
  prompt: string; // Natural language description
  datasetId: string; // Dataset ID to use
}
```

#### Example:

```bash
curl -X POST http://localhost:3000/api/ai/generate-chart-config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a smooth line chart showing revenue by month with dark theme",
    "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
  }'
```

**⚠️ Common Mistakes:**

```json
// ❌ WRONG: Trailing comma causes JSON parse error
{
  "prompt": "Create a line chart",
  "datasetId": "xxx",  // <- Remove this comma!
}

// ✅ CORRECT:
{
  "prompt": "Create a line chart",
  "datasetId": "xxx"
}
```

**Response:**

```json
{
  "code": 200,
  "message": "Chart configuration generated successfully",
  "data": {
    "type": "line",
    "config": {
      "title": "Revenue by Month",
      "width": 800,
      "height": 400,
      "margin": { "top": 20, "left": 50, "right": 30, "bottom": 40 },
      "theme": "dark",
      "xAxisKey": "cmfp0xm9v0002193gt2vmnyf5",
      "yAxisKeys": ["cmfp0xm9v0003193g971yzucg"],
      "xAxisLabel": "Month",
      "yAxisLabel": "Revenue",
      "showLegend": true,
      "showGrid": true,
      "showTooltip": true,
      "animationDuration": 1000,
      "lineType": "smooth",
      "showPoints": true
    },
    "explanation": "I created a line chart with months on X-axis and revenue on Y-axis. Dark theme and smooth curves applied as requested.",
    "suggestedName": "Revenue by Month Analysis",
    "chartUrl": "/workspace/charts/editor?config=eyJ0eXBlIjoibGluZSIsImNvbmZpZyI6eyJ0aXRsZSI6IlJldmVudWUgYnkgTW9udGgiLCJ3aWR0aCI6ODAwLCJoZWlnaHQiOjQwMCwibWFyZ2luIjp7InRvcCI6MjAsImxlZnQiOjUwLCJyaWdodCI6MzAsImJvdHRvbSI6NDB9LCJ0aGVtZSI6ImRhcmsiLCJ4QXhpc0tleSI6ImNtZnAweG05djAwMDIxOTNndDJ2bW55ZjUiLCJ5QXhpc0tleXMiOlsiY21mcDB4bTl2MDAwMzE5M2c5NzF5enVjZyJdLCJ4QXhpc0xhYmVsIjoiTW9udGgiLCJ5QXhpc0xhYmVsIjoiUmV2ZW51ZSIsInNob3dMZWdlbmQiOnRydWUsInNob3dHcmlkIjp0cnVlLCJzaG93VG9vbHRpcCI6dHJ1ZSwiYW5pbWF0aW9uRHVyYXRpb24iOjEwMDAsImxpbmVUeXBlIjoic21vb3RoIiwic2hvd1BvaW50cyI6dHJ1ZX0sIm5hbWUiOiJSZXZlbnVlIGJ5IE1vbnRoIEFuYWx5c2lzIiwiZGF0YXNldElkIjoiY21mcDB4bTl2MDAwMTE5M2d0MnZtbnlmNCJ9",
    "success": true
  }
}
```

---

## 🎨 Config Structure

Generated config follows this structure:

```typescript
{
  type: string;              // Chart type: 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'heatmap' | 'histogram' | 'cycleplot'

  config: {
    // Basic settings
    title: string;           // Chart title
    width: number;           // Chart width (default: 800)
    height: number;          // Chart height (default: 400)
    margin: {                // Chart margins
      top: number;
      left: number;
      right: number;
      bottom: number;
    };
    theme: 'light' | 'dark'; // Chart theme

    // Data mapping (IMPORTANT: Uses header IDs, not names)
    xAxisKey: string;        // DataHeader ID for X axis
    yAxisKeys: string[];     // DataHeader IDs for Y axis (can be multiple)

    // Labels
    xAxisLabel?: string;     // X axis label
    yAxisLabel?: string;     // Y axis label

    // Display options
    showLegend: boolean;     // Show legend
    showGrid: boolean;       // Show grid lines
    showTooltip: boolean;    // Show tooltip on hover
    showValues: boolean;     // Show values on chart
    animationDuration: number; // Animation duration (ms)

    // Chart-specific options
    lineType?: 'basic' | 'smooth' | 'stepped' | 'dashed';  // Line chart
    barType?: 'grouped' | 'stacked' | 'percentage';        // Bar chart
    areaType?: 'basic' | 'stacked' | 'percentage' | 'stream'; // Area chart
    pieType?: 'basic' | 'exploded' | 'nested';             // Pie chart
    // ... more options based on chart type
  }
}
```

---

## 💻 Frontend Integration

### React/TypeScript Example (Complete Implementation)

```typescript
import { useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Dataset {
  id: string;
  name: string;
  description?: string;
}

function ChartChatbox() {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);

  const sendMessage = async () => {
    const response = await fetch('/api/ai/chat-with-ai', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        datasetId: selectedDataset,
        messages: JSON.stringify(chatHistory)
      })
    });
    if (data.needsDatasetSelection) {
      // ⭐ QUAN TRỌNG: User chưa chọn dataset
      // Hiển thị dataset picker UI
      setAvailableDatasets(data.datasets || []);
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);

      // Clear selected dataset nếu có
      setSelectedDataset(null);
    } else if (data.chartGenerated) {{ role: 'user', content: message }]);

    if (data.needsDatasetSelection) {
      // Show dataset picker
      setAvailableDatasets(data.datasets);
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } else if (data.chartGenerated) {
      // Chart generated successfully
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);

      // Option 1: Open in new tab
      window.open(data.chartData.chartUrl, '_blank');

      // Option 2: Navigate to editor
      // window.location.href = data.chartData.chartUrl;

      // Option 3: Show preview modal
      // showChartPreview(data.chartData);
    } else {
      // Regular chat response
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
    }

    setMessage('');
  };

  return (
    <div className="chatbox">
      <div className="messages">
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.content}
      {/* ⭐ Dataset Picker - Hiển thị khi needsDatasetSelection = true */}
      {availableDatasets.length > 0 && (
        <div className="dataset-picker">
          <h4>📊 Chọn Dataset:</h4>
          <div className="dataset-list">
            {availableDatasets.map(ds => (
              <div key={ds.id} className="dataset-item">
                <button
                  onClick={() => {
                    setSelectedDataset(ds.id);
                    setAvailableDatasets([]);
                    // Tự động gửi message để confirm selection
                    setMessage(`Đã chọn dataset "${ds.name}". Hãy tạo biểu đồ...`);
                  }}
                  className="dataset-button"
                >
                  <strong>{ds.name}</strong>
                  {ds.description && <p className="description">{ds.description}</p>}
                </button>
              </div>
            ))}
          </div>
          <p className="hint">💡 Click vào dataset để chọn, sau đó mô tả biểu đồ bạn muốn tạo</p>
        </div>
      )}      {ds.name}
            </button>
          ))}
        </div>
      )}

      <div className="input-area">
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && sendMessage()}
          placeholder="Nhập tin nhắn..."
        />
        <button onClick={sendMessage}>Gửi</button>
      </div>
    </div>
  );
}
```

---

## 🔗 Chart URL Format

Generated `chartUrl` uses base64url encoding:

```
/workspace/charts/editor?config=<base64url-encoded-json>
```

**Decoded JSON structure:**

```json
{
  "type": "line",
  "config": {
    /* full chart config */
  },
  "name": "Suggested Chart Name",
  "datasetId": "dataset-id"
}
```

**Frontend can decode:**

```typescript
const urlParams = new URLSearchParams(window.location.search);
const configBase64 = urlParams.get("config");

if (configBase64) {
  const decoded = Buffer.from(configBase64, "base64url").toString("utf-8");
  const chartData = JSON.parse(decoded);

  // Load chart editor with this config
  loadChartEditor(chartData);
}
```

---

## 📝 Example Prompts

### Vietnamese:

- ✅ "Tạo line chart hiển thị doanh thu theo tháng"
- ✅ "Vẽ bar chart so sánh doanh số các chi nhánh"
- ✅ "Biểu đồ tròn thể hiện tỷ lệ sản phẩm bán được"
- ✅ "Scatter plot mối quan hệ giữa giá và số lượng"
- ✅ "Heatmap nhiệt độ trung bình theo tháng và năm"
- ✅ "Histogram phân bố độ tuổi khách hàng"
- ✅ "Line chart với theme tối và đường cong mượt"

### English:

- ✅ "Create a line chart showing revenue over time"
- ✅ "Bar chart comparing sales by region"
- ✅ "Pie chart for product distribution"
- ✅ "Scatter plot of price vs quantity"
- ✅ "Heatmap of temperature by month and year"
- ✅ "Histogram of customer age distribution"
- ✅ "Dark themed smooth line chart"

---

## ⚙️ Advanced Features

### Custom Styling in Prompt:

```
"Tạo line chart với:
- Theme tối
- Đường cong mượt
- Hiển thị legend
- Hiển thị grid
- Không hiển thị điểm dữ liệu"
```

AI will parse and apply:

- `theme: 'dark'`
- `lineType: 'smooth'`
- `showLegend: true`
- `showGrid: true`
- `showPoints: false`

### Multiple Y Axes:

```
"Tạo line chart hiển thị doanh thu và số lượng đơn hàng theo tháng"
```

AI will select 2 columns for Y axis if applicable.

---

## 🐛 Error Handling

### ❌ Chart request not detected (Regular chat response instead)

**Problem:**

```json
{
  "code": 200,
  "data": {
    "reply": "Để tạo một biểu đồ đường (Line Chart), bạn cần chọn dataset trước...",
    "success": true
    // ❌ Missing: needsDatasetSelection, datasets
  }
}
```

**Cause:**

- Message không có intent TẠO chart rõ ràng
- Ví dụ: "Line Chart" (chỉ mention chart, không có ý định tạo)

**Solution:**

```json
// ❌ WRONG: Không rõ intent
{
  "message": "Line Chart"
}

// ✅ CORRECT: Có intent TẠO rõ ràng
{
  "message": "Tạo line chart hiển thị doanh thu"
}

// ✅ CORRECT: English
{
  "message": "Create a line chart showing sales"
}
```

**Keywords that trigger chart generation:**

- Vietnamese: `tạo biểu đồ`, `tạo chart`, `vẽ biểu đồ`, `vẽ chart`
- English: `create chart`, `generate chart`, `make chart`, `draw chart`

**⚠️ Note:** Questions about charts (e.g., "Line Chart là gì?") will NOT trigger generation

---

### ❌ Missing datasetId in /generate-chart-config:

**Error:**

```json
{
  "statusCode": 400,
  "message": "datasetId should not be empty, datasetId must be a string",
  "error": {
    "message": "datasetId should not be empty, datasetId must be a string",
    "details": ["datasetId should not be empty", "datasetId must be a string"]
  }
}
```

**Cause:**

```json
// ❌ WRONG: Missing datasetId
{
  "prompt": "Create a line chart showing sales over time"
  // Missing datasetId!
}
```

**🎯 SOLUTION:**

**Option 1 (RECOMMENDED): Dùng /chat-with-ai**

```json
// ✅ Dùng chat-with-ai - Không cần datasetId
POST /api/ai/chat-with-ai
{
  "message": "Tạo line chart hiển thị doanh thu"
  // Không cần datasetId, backend sẽ list datasets
}
```

**Option 2: Provide datasetId**

```json
// ✅ Provide datasetId if known
POST /api/ai/generate-chart-config
{
  "prompt": "Create a line chart showing sales over time",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### ❌ Invalid JSON (Trailing comma):

**Error:**

```json
{
  "statusCode": 400,
  "message": "Expected double-quoted property name in JSON at position 97",
  "error": "Bad Request"
}
```

**Cause:**

```json
// ❌ WRONG: Trailing comma
{
  "prompt": "Create a line chart",
  "datasetId": "xxx",  // <- Extra comma here
}

// ✅ CORRECT: No trailing comma
{
  "prompt": "Create a line chart",
  "datasetId": "xxx"
}
```

**Solution:** Remove the trailing comma after the last property in JSON.

---

### ❌ Dataset not found:

```json
{
  "reply": "❌ Dataset không tồn tại. Vui lòng chọn dataset hợp lệ.",
  "success": false
}
```

---

### ❌ No permission:

```json
{
  "reply": "❌ Bạn không có quyền truy cập dataset này.",
  "success": false
}
```

---

### ❌ Generation failed:

```json
{
  "reply": "❌ Có lỗi khi tạo biểu đồ: [error message]\n\nVui lòng thử lại hoặc mô tả chi tiết hơn.",
  "success": false
}
```

---

### ❌ Missing datasetId:

```json
{
  "statusCode": 400,
  "message": "Dataset ID is required",
  "error": "Bad Request"
}
## 🔄 Complete User Flow

### ⭐ RECOMMENDED FLOW: Dùng Chat AI

```

┌──────────────────────────────────────────────────────────┐
│ 1. User trong chatbox: "Tạo biểu đồ line chart" │
│ Request: POST /chat-with-ai │
│ Body: { "message": "Tạo biểu đồ line chart" } │
│ (KHÔNG cần datasetId) │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 2. Backend tự động query datasets của user │
│ const datasets = await prisma.dataset.findMany(...) │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 3. Response: needsDatasetSelection = true │
│ { │
│ "reply": "📊 Chọn dataset...", │
│ "needsDatasetSelection": true, │
│ "datasets": [ │
│ { "id": "xxx", "name": "Sales Data" }, │
│ { "id": "yyy", "name": "Revenue Report" } │
│ ] │
│ } │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 4. Frontend hiển thị dataset picker trong chat │
│ - Show list datasets với name + description │
│ - User click chọn "Sales Data" │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 5. User nhập: "Tạo line chart doanh thu theo tháng" │
│ Request: POST /chat-with-ai │
│ Body: { │
│ "message": "Tạo line chart doanh thu theo tháng", │
│ "datasetId": "xxx" ← Đã có dataset │
│ } │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 6. Backend generate chart config với AI │
│ - Fetch dataset headers │
│ - Call OpenRouter API │
│ - Generate config + chartUrl │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 7. Response: chartGenerated = true │
│ { │
│ "reply": "✅ Đã tạo biểu đồ thành công!", │
│ "chartGenerated": true, │
│ "chartData": { │
│ "type": "line", │
│ "config": { ... }, │
│ "chartUrl": "/workspace/charts/editor?config=..." │
│ } │
│ } │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ 8. Frontend redirect hoặc open trong modal │
│ window.location.href = chartData.chartUrl │
│ hoặc │
│ window.open(chartData.chartUrl, '\_blank') │
└──────────────────────────────────────────────────────────┘

```

---

### ⚠️ AVOID: Direct /generate-chart-config

```

┌──────────────────────────────────────────────────────────┐
│ ❌ User call /generate-chart-config mà không có datasetId│
│ Request: POST /generate-chart-config │
│ Body: { "prompt": "Create line chart" } │
│ (Missing datasetId!) │
└──────────────────────────────────────────────────────────┘
↓
┌──────────────────────────────────────────────────────────┐
│ ❌ Error 400: datasetId should not be empty │
└──────────────────────────────────────────────────────────┘

🎯 FIX: Dùng /chat-with-ai thay vì /generate-chart-config

````

---

### Flow 1: User chưa chọn dataset-config` without `datasetId`

**Solution:**

- Use `/chat-with-ai` instead (will auto-prompt for dataset)
- Or provide `datasetId` in request body

---

### ❌ Authentication required:

```json
{
  "statusCode": 401,
  "message": "User authentication required",
  "error": "Unauthorized"
}
````

**Solution:** Include valid Bearer token in `Authorization` header

---

## 🔒 Authentication

### Swagger UI Authentication

**Step 1: Access Swagger UI**

```
URL: http://localhost:4000/api-docs
Username: (from SWAGGER_ACCOUNT_NAME env)
Password: (from SWAGGER_ACCOUNT_PASS env)
```

**Step 2: Authorize with JWT Token**

1. Click nút **"Authorize"** 🔓 ở góc trên bên phải
2. Nhập JWT token vào field `Value`:
   ```
   Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   hoặc chỉ cần:
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. Click **"Authorize"**
4. Click **"Close"**

**⚠️ QUAN TRỌNG:**

- Swagger đã được config với `.addBearerAuth()` ✅
- Controller đã có `@ApiBearerAuth()` ✅
- Nút Authorize sẽ xuất hiện SAU KHI login vào Swagger UI
- Token sẽ được tự động thêm vào header `Authorization: Bearer <token>`

### Get JWT Token

**Option 1: Login API**

```bash
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "your@email.com",
  "password": "yourpassword"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Option 2: From Browser DevTools**

- Login vào ứng dụng
- Mở DevTools → Application/Storage → localStorage
- Copy giá trị `access_token` hoặc `token`

---

All endpoints require Bearer token authentication:

## 🎯 Best Practices

1. **Handle Dataset Selection Flow** ⭐
   - KHÔNG cần specify dataset trong prompt đầu tiên
   - Hệ thống sẽ TỰ ĐỘNG hiển thị datasets khi phát hiện user muốn tạo chart
   - Frontend PHẢI xử lý response field `needsDatasetSelection`
2. **Dataset Selection UI**
   - Hiển thị dataset picker khi `needsDatasetSelection === true`
   - Show dataset name + description để user dễ chọn
   - Sau khi chọn, gửi lại request với `datasetId`

3. **Prompt Quality**
   - Be descriptive (mention chart type, axes, styling)
   - Use Vietnamese or English - AI supports both
   - Example: "Tạo line chart doanh thu theo tháng với theme tối"

4. **Response Handling**

## 📞 Support & Troubleshooting

### Common Issues:

1. **"datasetId should not be empty"** ⭐ MOST COMMON
   - ❌ Cause: Gọi `/generate-chart-config` mà không có datasetId
   - ✅ Fix: Dùng `/chat-with-ai` thay thế (tự động handle dataset selection)
   - ✅ Hoặc: Provide datasetId trong request body

2. **"Chart request not detected"** (Backend trả về regular chat)
   - ❌ Cause: Message không có intent TẠO chart rõ ràng
   - ✅ Fix: Dùng keywords: "tạo biểu đồ", "create chart", "vẽ chart"
   - ❌ Avoid: "Line Chart là gì?" (câu hỏi, không phải yêu cầu tạo)

3. **"Expected double-quoted property name in JSON"**

### Flow 1: User chưa chọn dataset

```
1. User: "Tạo biểu đồ line chart"
   ↓
2. Backend phát hiện chart request + không có datasetId
   ↓
3. Backend query datasets của user
   ↓
4. Response: needsDatasetSelection=true + danh sách datasets
   ↓
5. Frontend hiển thị dataset picker
   ↓
### Debug Checklist:

- [ ] 🔥 Đang dùng `/chat-with-ai` (RECOMMENDED) hay `/generate-chart-config`?
- [ ] 🔥 Nếu dùng `/generate-chart-config`: Đã provide `datasetId` chưa?
- [ ] JSON syntax is valid (no trailing commas)
- [ ] Bearer token is included and valid
- [ ] Dataset exists and belongs to user
- [ ] Dataset has headers configured
- [ ] Prompt is descriptive and clear
- [ ] Check API logs for detailed error messages

### Which Endpoint to Use?

| Scenario | Use Endpoint | Reason |
|----------|-------------|---------|
| User trong chatbox muốn tạo chart | `/chat-with-ai` | ✅ Tự động list datasets |
| Chưa biết datasetId | `/chat-with-ai` | ✅ Backend tự xử lý |
| Đã biết datasetId, cần generate nhanh | `/generate-chart-config` | ✅ Direct generation |
| Batch processing | `/generate-chart-config` | ✅ No chat needed |
| Integration với UI khác | `/generate-chart-config` | ✅ API only |
10. Frontend redirect đến Chart Editor
```

### Flow 2: User đã chọn dataset (trong UI context)

```
1. Frontend có selectedDataset state
   ↓
2. User: "Tạo line chart doanh thu theo tháng"
   ↓
3. Frontend gửi: message + datasetId
   ↓
4. Backend generate trực tiếp
   ↓
5. Response: chartGenerated=true + chartUrl
   ↓
6. Frontend redirect đến Chart Editor
```

---

## 📚 Related Endpoints

- `GET /api/datasets` - List user's datasets (used internally by chat AI)
- `GET /api/datasets/:id` - Get dataset with headers
- `POST /api/charts` - Create chart from config
- `PUT /api/charts/:id` - Update chart config

6. **Error Handling**
   - Validate dataset ownership
   - Handle empty dataset list
   - Show friendly error messages

## 🎯 Best Practices

1. **Always specify dataset** when creating charts via chat
2. **Be descriptive** in prompts (mention chart type, axes, styling)
3. **Use Vietnamese or English** - AI supports both
4. **Handle `needsDatasetSelection`** in frontend to show dataset picker
5. **Parse `chartUrl`** to redirect or open in new tab
6. **Cache chat history** for better context
7. **Validate dataset ownership** before sending to AI

---

## 📚 Related Endpoints

- `GET /api/datasets` - List user's datasets
- `GET /api/datasets/:id` - Get dataset with headers
- `POST /api/charts` - Create chart from config
- `PUT /api/charts/:id` - Update chart config

---

## 🚀 Performance Tips

- Chat AI response: ~2-5 seconds
- Chart generation: ~3-7 seconds
- Use loading indicators in UI
- Cache dataset list to reduce API calls
- Implement debouncing for chat input

---

## 📞 Support & Troubleshooting

### Common Issues:

1. **"Expected double-quoted property name in JSON"**
   - ❌ Cause: Trailing comma in JSON
   - ✅ Fix: Remove comma after last property

2. **"Dataset not found"**
   - ❌ Cause: Invalid datasetId or dataset deleted
   - ✅ Fix: Verify dataset exists via `GET /api/datasets`

3. **"User authentication required"**
   - ❌ Cause: Missing or invalid Bearer token
   - ✅ Fix: Include valid token in Authorization header

4. **"Failed to generate chart config"**
   - ❌ Cause: Dataset has no headers or invalid data
   - ✅ Fix: Ensure dataset has properly configured headers

5. **Empty datasets list**
   - ❌ Cause: User hasn't uploaded any datasets
   - ✅ Fix: Upload dataset first via `POST /api/datasets`

### Debug Checklist:

- [ ] JSON syntax is valid (no trailing commas)
- [ ] Bearer token is included and valid
- [ ] Dataset exists and belongs to user
- [ ] Dataset has headers configured
- [ ] Prompt is descriptive and clear
- [ ] Check API logs for detailed error messages

---

## 🧪 Testing Examples & Request Bodies

### Test 1: Chat AI - Không có dataset (Auto list datasets)

**Request:**

```bash
POST http://localhost:3000/api/ai/chat-with-ai
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "message": "Tạo biểu đồ line chart"
}
```

**Expected Response:**

```json
{
  "reply": "📊 **Chọn dataset để tạo biểu đồ**\n\nBạn có 3 datasets:...",
  "success": true,
  "needsDatasetSelection": true,
  "datasets": [{ "id": "xxx", "name": "Sales Data 2024", "description": "..." }]
}
```

---

### Test 2: Chat AI - Đã có dataset (Generate chart)

**Request:**

```bash
POST http://localhost:3000/api/ai/chat-with-ai
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "message": "Tạo line chart hiển thị doanh thu theo tháng với theme tối và đường cong mượt",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

**Expected Response:**

```json
{
  "reply": "✅ **Đã tạo biểu đồ thành công!**...",
  "success": true,
  "chartGenerated": true,
  "chartData": {
    "type": "line",
    "config": { ... },
    "chartUrl": "/workspace/charts/editor?config=..."
  }
}
```

---

### Test 3: Direct Generation (Requires datasetId)

**Request:**

```bash
POST http://localhost:3000/api/ai/generate-chart-config
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "prompt": "Create a smooth line chart showing revenue by month with dark theme",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 4: Bar Chart với nhiều options

**Body:**

```json
{
  "message": "Tạo bar chart so sánh doanh số các chi nhánh, kiểu stacked, theme light, hiển thị values",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 5: Pie Chart

**Body:**

```json
{
  "prompt": "Pie chart showing product distribution with percentages",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 6: Scatter Plot

**Body:**

```json
{
  "message": "Scatter plot mối quan hệ giữa giá và số lượng bán",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 7: Heatmap

**Body:**

```json
{
  "prompt": "Heatmap of temperature by month and year",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 8: Histogram

**Body:**

```json
{
  "message": "Tạo histogram phân bố độ tuổi khách hàng",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 9: Multiple Y axes

**Body:**

```json
{
  "message": "Tạo line chart hiển thị doanh thu và số lượng đơn hàng theo tháng",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 10: Chat với history

**Body:**

```json
{
  "message": "Tạo thêm với theme tối",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4",
  "messages": "[{\"role\":\"user\",\"content\":\"Tạo line chart doanh thu\"},{\"role\":\"assistant\",\"content\":\"Đã tạo line chart...\"}]"
}
```

---

### Test 11: Area Chart

**Body:**

```json
{
  "prompt": "Create a stacked area chart showing cumulative sales over time with smooth curves",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

### Test 12: Custom styling

**Body:**

```json
{
  "message": "Tạo line chart với:\n- Theme tối\n- Đường cong mượt\n- Hiển thị legend\n- Hiển thị grid\n- Không hiển thị điểm dữ liệu",
  "datasetId": "cmfp0xm9v0001193gt2vmnyf4"
}
```

---

## 🔧 Postman Collection

### Setup Environment

1. Create new Environment: "DataVis Local"
2. Add Variables:
   ```
   baseUrl: http://localhost:3000
   token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   datasetId: cmfp0xm9v0001193gt2vmnyf4
   ```

### Request Template - Chat AI (No Dataset)

```
Method: POST
URL: {{baseUrl}}/api/ai/chat-with-ai

Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json

Body (raw JSON):
{
  "message": "Tạo biểu đồ line chart"
}
```

### Request Template - Chat AI (With Dataset)

```
Method: POST
URL: {{baseUrl}}/api/ai/chat-with-ai

Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json

Body (raw JSON):
{
  "message": "Tạo line chart doanh thu theo tháng với theme tối",
  "datasetId": "{{datasetId}}"
}
```

### Request Template - Direct Generation

```
Method: POST
URL: {{baseUrl}}/api/ai/generate-chart-config

Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json

Body (raw JSON):
{
  "prompt": "Create a smooth line chart with dark theme",
  "datasetId": "{{datasetId}}"
}
```

---

### cURL Examples for Quick Testing

**Test Chat AI:**

```bash
curl -X POST http://localhost:3000/api/ai/chat-with-ai \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Tạo line chart"}'
```

**Test Direct Generation:**

```bash
curl -X POST http://localhost:3000/api/ai/generate-chart-config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create line chart","datasetId":"YOUR_DATASET_ID"}'
```

---

**Last Updated:** December 10, 2025  
**API Version:** v1  
**Model:** Google Gemini 2.5 Flash Lite Preview

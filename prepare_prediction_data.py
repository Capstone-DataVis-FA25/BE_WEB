"""
Script để chuẩn bị dữ liệu từ CSV và tạo request mẫu cho prediction API
"""
import pandas as pd
from datetime import datetime, timedelta
import json

def prepare_daily_sales_data(csv_path='data.csv', days=14, stock_code=None, country=None):
    """
    Đọc CSV và tổng hợp dữ liệu bán hàng theo ngày
    
    Args:
        csv_path: Đường dẫn file CSV
        days: Số ngày dữ liệu muốn lấy (default: 14)
        stock_code: Lọc theo sản phẩm cụ thể (optional)
        country: Lọc theo quốc gia (optional)
    """
    print(f"📂 Đang đọc file: {csv_path}")
    
    # Đọc CSV
    df = pd.read_csv(csv_path)
    
    print(f"📊 Tổng số records: {len(df):,}")
    print(f"📅 Cột ngày: InvoiceDate")
    
    # Parse date
    df['InvoiceDate'] = pd.to_datetime(df['InvoiceDate'])
    df['Date'] = df['InvoiceDate'].dt.date
    
    # Filter nếu cần
    if stock_code:
        df = df[df['StockCode'] == stock_code]
        print(f"🔍 Lọc theo StockCode: {stock_code} -> {len(df):,} records")
    
    if country:
        df = df[df['Country'] == country]
        print(f"🌍 Lọc theo Country: {country} -> {len(df):,} records")
    
    # Tổng hợp theo ngày
    daily_sales = df.groupby('Date')['Quantity'].sum().reset_index()
    daily_sales = daily_sales.sort_values('Date')
    
    # Lấy N ngày gần nhất
    daily_sales = daily_sales.tail(days)
    
    print(f"\n📈 Dữ liệu đã tổng hợp:")
    print(f"   Từ ngày: {daily_sales['Date'].min()}")
    print(f"   Đến ngày: {daily_sales['Date'].max()}")
    print(f"   Số ngày: {len(daily_sales)}")
    print(f"   Tổng số lượng trung bình/ngày: {daily_sales['Quantity'].mean():,.0f}")
    
    # Tạo request payload
    daily_sales_list = []
    for _, row in daily_sales.iterrows():
        daily_sales_list.append({
            'date': row['Date'].strftime('%Y-%m-%d'),
            'quantity': int(row['Quantity'])
        })
    
    payload = {
        'dailySales': daily_sales_list
    }
    
    if stock_code:
        payload['stockCode'] = stock_code
    if country:
        payload['country'] = country
    
    return payload, daily_sales

def print_curl_command(payload):
    """In curl command để test API"""
    print("\n" + "="*70)
    print("🚀 CURL COMMAND - Copy và chạy:")
    print("="*70)
    print(f"""
curl -X POST http://localhost:3000/prediction/next-day \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{json.dumps(payload, indent=2)}'
""")

def print_request_body(payload):
    """In request body JSON"""
    print("\n" + "="*70)
    print("📋 REQUEST BODY - Copy vào Postman/Swagger:")
    print("="*70)
    print(json.dumps(payload, indent=2))

def analyze_data(daily_sales):
    """Phân tích xu hướng dữ liệu"""
    print("\n" + "="*70)
    print("📊 PHÂN TÍCH DỮ LIỆU:")
    print("="*70)
    
    quantities = daily_sales['Quantity'].values
    
    # Statistics
    print(f"Min:  {quantities.min():,.0f}")
    print(f"Max:  {quantities.max():,.0f}")
    print(f"Mean: {quantities.mean():,.0f}")
    print(f"Std:  {quantities.std():,.0f}")
    
    # Trend
    first_half = quantities[:len(quantities)//2].mean()
    second_half = quantities[len(quantities)//2:].mean()
    trend_percent = ((second_half - first_half) / first_half) * 100
    
    if trend_percent > 5:
        trend = "📈 TĂNG"
    elif trend_percent < -5:
        trend = "📉 GIẢM"
    else:
        trend = "➡️ ỔN ĐỊNH"
    
    print(f"\nXu hướng: {trend} ({trend_percent:+.1f}%)")
    
    # Sample data
    print(f"\n📅 Dữ liệu mẫu (5 ngày đầu):")
    for i in range(min(5, len(daily_sales))):
        row = daily_sales.iloc[i]
        print(f"   {row['Date']}: {row['Quantity']:,} units")

if __name__ == "__main__":
    print("="*70)
    print("🎯 CHUẨN BỊ DỮ LIỆU CHO LSTM PREDICTION")
    print("="*70)
    
    # =================================================================
    # CẤU HÌNH - Điều chỉnh ở đây
    # =================================================================
    CSV_PATH = 'data.csv'              # Đường dẫn file CSV
    DAYS = 14                          # Số ngày dữ liệu (7-30 ngày)
    STOCK_CODE = None                  # None = tất cả sản phẩm
    COUNTRY = 'United Kingdom'         # None = tất cả quốc gia
    
    # =================================================================
    
    try:
        # Chuẩn bị dữ liệu
        payload, daily_sales = prepare_daily_sales_data(
            csv_path=CSV_PATH,
            days=DAYS,
            stock_code=STOCK_CODE,
            country=COUNTRY
        )
        
        # Phân tích
        analyze_data(daily_sales)
        
        # In request examples
        print_request_body(payload)
        print_curl_command(payload)
        
        # Save to file
        output_file = 'prediction_request.json'
        with open(output_file, 'w') as f:
            json.dump(payload, f, indent=2)
        print(f"\n💾 Request body đã lưu vào: {output_file}")
        
        print("\n" + "="*70)
        print("✅ HOÀN TẤT! Dữ liệu đã sẵn sàng để test API")
        print("="*70)
        
    except Exception as e:
        print(f"\n❌ Lỗi: {e}")
        print("\nKiểm tra:")
        print("  1. File CSV có tồn tại không?")
        print("  2. Cấu trúc CSV có đúng không? (InvoiceDate, Quantity, StockCode, Country)")
        print("  3. pip install pandas")

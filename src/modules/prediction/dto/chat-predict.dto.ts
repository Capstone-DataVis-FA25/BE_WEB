import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ChatPredictDto {
  @ApiProperty({
    description: 'Prompt mô tả dữ liệu bán hàng và yêu cầu dự đoán. AI sẽ tự động trích xuất số liệu từ văn bản.',
    example: 'Doanh số 7 ngày qua: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?',
    type: String,
    examples: {
      'Ví dụ 1 - Đơn giản': {
        value: 'Doanh số 7 ngày: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Dự đoán ngày mai?',
        summary: 'Prompt đơn giản với 7 ngày dữ liệu'
      },
      'Ví dụ 2 - Chi tiết': {
        value: 'Cửa hàng tôi trong tuần vừa rồi bán được: ngày 1 bán 5000 sản phẩm, ngày 2 bán 5200, ngày 3 bán 4800, ngày 4 bán 5100, ngày 5 bán 5300, ngày 6 bán 5400, ngày 7 bán 5600. Hãy dự đoán ngày mai sẽ bán được bao nhiêu?',
        summary: 'Prompt chi tiết với mô tả'
      },
      'Ví dụ 3 - 14 ngày': {
        value: 'Dữ liệu bán hàng 14 ngày: 5000, 5200, 4800, 5100, 5300, 5400, 5600, 5800, 6000, 6200, 6100, 6300, 6500, 6700. Dự đoán cho ngày tiếp theo?',
        summary: '14 ngày dữ liệu để prediction chính xác hơn'
      },
      'Ví dụ 4 - Tiếng Anh': {
        value: 'Last 7 days sales: 1000, 1200, 1500, 1800, 2000, 2200, 2500. Predict tomorrow?',
        summary: 'English prompt example'
      },
      'Ví dụ 5 - Số lớn': {
        value: 'Doanh số 7 ngày qua: 15000, 16500, 14200, 18300, 19500, 17800, 20100. Dự đoán ngày tiếp theo?',
        summary: 'Dữ liệu với số lượng lớn'
      }
    }
  })
  @IsString()
  prompt: string;

  @ApiProperty({
    description: 'Ngôn ngữ response (vi = Tiếng Việt, en = English)',
    example: 'vi',
    required: false,
    default: 'vi',
    enum: ['vi', 'en']
  })
  @IsOptional()
  @IsString()
  language?: string;
}

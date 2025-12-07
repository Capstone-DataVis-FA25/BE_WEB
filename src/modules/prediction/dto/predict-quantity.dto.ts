import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, ArrayMinSize } from 'class-validator';

export class PredictQuantityDto {
  @ApiProperty({
    description: 'Historical quantity data (sequence of past values) - Dữ liệu lịch sử để dự đoán',
    example: [100, 120, 115, 130, 125, 140, 135],
    type: [Number],
    examples: {
      '7 values': {
        value: [100, 120, 115, 130, 125, 140, 135],
        summary: '7 điểm dữ liệu'
      },
      '14 values': {
        value: [1000, 1100, 1050, 1200, 1150, 1300, 1250, 1400, 1350, 1500, 1450, 1600, 1550, 1700],
        summary: '14 điểm dữ liệu - Chính xác hơn'
      },
      'Large numbers': {
        value: [15000, 16500, 14200, 18300, 19500, 17800, 20100],
        summary: 'Số lượng lớn'
      }
    }
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  historicalData: number[];

  @ApiProperty({
    description: 'Number of future steps to predict - Số bước muốn dự đoán vào tương lai',
    example: 7,
    required: false,
    default: 1,
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsNumber()
  steps?: number;
}

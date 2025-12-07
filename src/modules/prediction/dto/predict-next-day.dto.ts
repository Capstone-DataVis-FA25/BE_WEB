import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, ArrayMinSize, IsDateString } from 'class-validator';

export class DailySalesData {
  @ApiProperty({
    description: 'Ngày (YYYY-MM-DD)',
    example: '2010-12-01',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Tổng số lượng bán trong ngày',
    example: 1250,
  })
  quantity: number;
}

export class PredictNextDayDto {
  @ApiProperty({
    description: 'Dữ liệu bán hàng theo ngày (khuyến nghị 7-30 ngày gần nhất để prediction chính xác)',
    type: [DailySalesData],
    example: [
      { date: '2010-12-01', quantity: 1200 },
      { date: '2010-12-02', quantity: 1350 },
      { date: '2010-12-03', quantity: 1180 },
      { date: '2010-12-04', quantity: 1420 },
      { date: '2010-12-05', quantity: 1560 },
      { date: '2010-12-06', quantity: 1490 },
      { date: '2010-12-07', quantity: 1630 },
    ],
    examples: {
      '7 ngày': {
        value: [
          { date: '2010-12-01', quantity: 1200 },
          { date: '2010-12-02', quantity: 1350 },
          { date: '2010-12-03', quantity: 1180 },
          { date: '2010-12-04', quantity: 1420 },
          { date: '2010-12-05', quantity: 1560 },
          { date: '2010-12-06', quantity: 1490 },
          { date: '2010-12-07', quantity: 1630 },
        ],
        summary: '7 ngày dữ liệu - Cơ bản'
      },
      '14 ngày': {
        value: [
          { date: '2010-12-01', quantity: 5000 },
          { date: '2010-12-02', quantity: 5200 },
          { date: '2010-12-03', quantity: 4800 },
          { date: '2010-12-04', quantity: 5100 },
          { date: '2010-12-05', quantity: 5300 },
          { date: '2010-12-06', quantity: 5400 },
          { date: '2010-12-07', quantity: 5600 },
          { date: '2010-12-08', quantity: 5800 },
          { date: '2010-12-09', quantity: 6000 },
          { date: '2010-12-10', quantity: 6200 },
          { date: '2010-12-11', quantity: 6100 },
          { date: '2010-12-12', quantity: 6300 },
          { date: '2010-12-13', quantity: 6500 },
          { date: '2010-12-14', quantity: 6700 },
        ],
        summary: '14 ngày - Chính xác hơn'
      },
      '30 ngày': {
        value: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(2010, 11, i + 1).toISOString().split('T')[0],
          quantity: 5000 + Math.floor(Math.random() * 2000)
        })),
        summary: '30 ngày - Tốt nhất cho prediction'
      }
    }
  })
  @IsArray()
  @ArrayMinSize(1)
  dailySales: DailySalesData[];

  @ApiProperty({
    description: 'Lọc theo sản phẩm cụ thể (StockCode) - Optional',
    example: '85123A',
    required: false,
  })
  @IsOptional()
  @IsString()
  stockCode?: string;

  @ApiProperty({
    description: 'Lọc theo quốc gia - Optional',
    example: 'United Kingdom',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;
}

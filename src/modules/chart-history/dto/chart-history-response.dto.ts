import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChartHistoryResponseDto {
  @ApiProperty({
    description: 'ID of the chart history record',
    example: 'clx1234567890abcdef',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the chart this history belongs to',
    example: 'clx1234567890abcdef',
  })
  chartId: string;

  @ApiProperty({
    description: 'ID of the dataset this chart uses',
    example: 'clx1234567890abcdef',
  })
  datasetId: string;

  @ApiProperty({
    description: 'Name of the chart at the time of this snapshot',
    example: 'Sales Chart - Version 1',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the chart at the time of this snapshot',
    example: 'Initial version of sales chart',
  })
  description?: string;

  @ApiProperty({
    description: 'Type of chart',
    example: 'line',
  })
  type: string;

  @ApiProperty({
    description: 'Configuration snapshot of the chart',
    example: {
      config: {
        title: 'Sample Chart',
        width: 700,
        height: 300,
      },
    },
  })
  config: any;

  @ApiProperty({
    description: 'Timestamp when this snapshot was created',
    example: '2025-11-02T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'User ID who made the change',
    example: 'clx1234567890abcdef',
  })
  updatedBy: string;

  @ApiPropertyOptional({
    description: 'Note about the change',
    example: 'Updated chart colors and layout',
  })
  changeNote?: string;
  
  @ApiPropertyOptional({
    description: 'URL of the chart snapshot image',
    example: 'https://res.cloudinary.com/demo/image/upload/v1234567890/chart-history.png',
  })
  imageUrl?: string;
}

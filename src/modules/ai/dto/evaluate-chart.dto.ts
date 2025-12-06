import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class EvaluateChartDto {
  @ApiProperty({
    description: 'Chart ID to evaluate',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsNotEmpty()
  @IsString()
  chartId: string;

  @ApiProperty({
    description: 'Base64 encoded chart image',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
  })
  @IsNotEmpty()
  @IsString()
  chartImage: string;

  @ApiPropertyOptional({
    description: 'Specific questions or aspects to evaluate',
    example: ['Is the color scheme appropriate?', 'Are the labels clear?']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questions?: string[];

  @ApiPropertyOptional({
    description: 'Language code for response',
    example: 'vi',
    default: 'vi'
  })
  @IsOptional()
  @IsString()
  language?: string;
}

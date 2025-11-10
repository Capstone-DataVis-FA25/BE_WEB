import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, IsOptional, MaxLength } from 'class-validator';

export class WebAnalysisDto {
  @ApiProperty({
    description: 'URL of the website to analyze',
    example: 'https://example.com/dashboard'
  })
  @IsUrl({}, { message: 'Please provide a valid URL' })
  @IsNotEmpty()
  url: string;

  @ApiProperty({
    description: 'Specific analysis question or focus area',
    example: 'Analyze the trend of user engagement metrics and predict next month performance'
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  analysisQuery: string;

  @ApiPropertyOptional({
    description: 'Historical data context (if available)',
    example: 'This website shows monthly active users data for the past 2 years'
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  historicalContext?: string;

  @ApiPropertyOptional({
    description: 'Specific metrics to focus on',
    example: 'Revenue, user growth, conversion rate, traffic sources'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  metricsOfInterest?: string;
}

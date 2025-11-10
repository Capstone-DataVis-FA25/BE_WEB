import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsArray, IsOptional, MaxLength, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum PredictionType {
  TIME_SERIES = 'time_series',
  REGRESSION = 'regression',
  CLASSIFICATION = 'classification',
  TREND_ANALYSIS = 'trend_analysis'
}

export enum TimeFrame {
  DAYS = 'days',
  WEEKS = 'weeks', 
  MONTHS = 'months',
  YEARS = 'years'
}

export class PredictiveAnalysisDto {
  @ApiProperty({
    description: 'Historical data in CSV format or JSON array',
    example: `Date,Value,Category\n2024-01-01,100,A\n2024-01-02,105,A\n2024-01-03,103,A`
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1_000_000)
  data: string;

  @ApiProperty({
    description: 'Type of prediction to perform',
    enum: PredictionType,
    example: PredictionType.TIME_SERIES
  })
  @IsEnum(PredictionType)
  predictionType: PredictionType;

  @ApiPropertyOptional({
    description: 'Target column name for prediction',
    example: 'Value'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetColumn?: string;

  @ApiPropertyOptional({
    description: 'Features/columns to use for prediction',
    example: ['Date', 'Category', 'PreviousValue']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Number of periods to predict into the future',
    example: 30
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  forecastPeriods?: number = 30;

  @ApiPropertyOptional({
    description: 'Time frame unit for forecast periods',
    enum: TimeFrame,
    example: TimeFrame.DAYS
  })
  @IsOptional()
  @IsEnum(TimeFrame)
  timeFrame?: TimeFrame = TimeFrame.DAYS;

  @ApiPropertyOptional({
    description: 'Confidence interval percentage (e.g., 95 for 95% confidence)',
    example: 95
  })
  @IsOptional()
  @IsNumber()
  @Min(80)
  @Max(99)
  confidenceLevel?: number = 95;

  @ApiPropertyOptional({
    description: 'Additional context or instructions for the AI model',
    example: 'This data represents daily sales. Consider seasonality and trends.'
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}

import { IsString, IsOptional, IsNumber, IsObject, IsArray } from 'class-validator';

export class CreateForecastDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  datasetId?: string;

  @IsString()
  targetColumn: string;

  @IsNumber()
  forecastWindow: number;

  @IsString()
  modelType: string;

  @IsArray()
  predictions: Array<{
    step: number;
    value: number;
    confidence: number;
    lowerBound: number;
    upperBound: number;
  }>;

  @IsOptional()
  @IsObject()
  metrics?: {
    trainMAE: number;
    trainRMSE: number;
    trainMAPE: number;
    trainR2: number;
    testMAE: number;
    testRMSE: number;
    testMAPE: number;
    testR2: number;
  };

  @IsOptional()
  @IsString()
  chartImageUrl?: string;

  @IsOptional()
  @IsArray()
  featureColumns?: string[];
}


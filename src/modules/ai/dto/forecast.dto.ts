import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class ForecastDto {
    @ApiPropertyOptional({
        description: 'CSV data as string (optional, script uses default dataset if not provided)',
        example: 'Date,Value\n2024-01-01,100\n2024-01-02,105'
    })
    @IsOptional()
    @IsString()
    csvData?: string;

    @ApiPropertyOptional({
        description: 'Dataset ID (optional, if using a dataset from the system)',
        example: 'c32259f9-7fbc-4e5e-872c-9becdb9f3ae2'
    })
    @IsOptional()
    @IsString()
    datasetId?: string;

    @ApiPropertyOptional({
        description: 'Forecast name (optional)',
        example: 'Q1 2024 Sales Forecast'
    })
    @IsOptional()
    @IsString()
    forecastName?: string;

    @ApiPropertyOptional({
        description: 'Target column name',
        example: 'Daily minimum temperatures in Melbourne, Australia, 1981-1990'
    })
    @IsOptional()
    @IsString()
    targetColumn?: string;

    @ApiPropertyOptional({
        description: 'Feature columns',
        example: []
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    featureColumns?: string[];

    @ApiPropertyOptional({
        description: 'Time scale: Daily, Weekly, Monthly, Quarterly, Yearly, Hourly',
        example: 'Daily',
        default: 'Daily'
    })
    @IsOptional()
    @IsString()
    timeScale?: string;

    @ApiPropertyOptional({
        description: 'Forecast window (number of steps to predict)',
        example: 30,
        default: 30
    })
    @IsOptional()
    @IsNumber()
    forecastWindow?: number;
}


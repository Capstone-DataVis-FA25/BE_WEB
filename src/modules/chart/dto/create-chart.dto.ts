import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsIn,
  IsNumber,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// Define supported chart types that align with the frontend
const CHART_TYPES = [
  "line",
  "bar",
  "pie",
  "area",
  "donut",
  "column",
  "scatter",
  "map",
  "heatmap",
  "bubble",
  "radar",
  "treemap",
  "sankey",
  "gauge",
  "funnel",
  "waterfall",
] as const;

type ChartType = (typeof CHART_TYPES)[number];

export class MarginDto {
  @ApiProperty({ example: 20 })
  @IsNumber()
  top: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  left: number;

  @ApiProperty({ example: 30 })
  @IsNumber()
  right: number;

  @ApiProperty({ example: 40 })
  @IsNumber()
  bottom: number;
}

export class ChartConfigDto {
  @ApiProperty({ description: "Chart title", example: "Sample Chart" })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: "Chart width in pixels", example: 700 })
  @IsNumber()
  width: number;

  @ApiProperty({ description: "Chart height in pixels", example: 300 })
  @IsNumber()
  height: number;

  @ApiProperty({ description: "Chart margins", type: MarginDto })
  @ValidateNested()
  @Type(() => MarginDto)
  margin: MarginDto;

  // Preferred storage: resolved DataHeader IDs (will be filled by service)
  @ApiPropertyOptional({
    description:
      "Resolved DataHeader ID used for X axis (prefer using xAxisIndex or xAxisName; the service will compute this)",
    example: "cmfp0xm9v0002193gt2vmnyf5",
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  xAxisKey?: string;

  @ApiPropertyOptional({
    description:
      "Resolved DataHeader IDs used for Y axes (prefer using yAxisIndices or yAxisNames; the service will compute this)",
    example: ["cmfp0xm9v0003193g971yzucg"],
    deprecated: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  yAxisKeys?: string[];

  // Selector alternatives: by index or by column name
  @ApiPropertyOptional({
    description: "X axis header index within dataset headers (0-based)",
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  xAxisIndex?: number;

  @ApiPropertyOptional({
    description: "Y axis header indices within dataset headers (0-based)",
    example: [1, 2],
  })
  @IsOptional()
  @IsArray()
  yAxisIndices?: number[];

  @ApiPropertyOptional({ description: "X axis header name", example: "month" })
  @IsOptional()
  @IsString()
  xAxisName?: string;

  @ApiPropertyOptional({
    description: "Y axis header names",
    example: ["ecommerce", "retail"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  yAxisNames?: string[];

  @ApiPropertyOptional({
    description: "X axis label (defaults to X DataHeader name if omitted)",
    example: "Month",
  })
  @IsString()
  @IsOptional()
  xAxisLabel?: string;

  @ApiPropertyOptional({
    description:
      "Y axis label (defaults to Y DataHeader names joined if omitted)",
    example: "Amount",
  })
  @IsString()
  @IsOptional()
  yAxisLabel?: string;

  @ApiPropertyOptional({
    description:
      "Labels for each Y series (defaults to Y DataHeader names if omitted)",
    example: ["Revenue (Millions VNĐ)", "Transactions"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  yAxisLabels?: string[];
}

export class CreateChartDto {
  @ApiProperty({
    description: "Name for the chart",
    example: "Sample Line Chart",
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: "Chart name is required" })
  @MaxLength(50, { message: "Chart name must be at most 50 characters long" })
  name: string;

  @ApiProperty({
    description: "Description for the chart",
    example: "A test line chart",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, {
    message: "Chart description must be at most 200 characters long",
  })
  description?: string;

  @ApiProperty({
    description: "Type of chart",
    example: "line",
    required: true,
    enum: CHART_TYPES,
  })
  @IsString()
  @IsNotEmpty({ message: "Chart type is required" })
  @IsIn(CHART_TYPES, { message: "Invalid chart type" })
  type: ChartType;

  @ApiProperty({
    description:
      "Chart configuration. If you omit axis mapping, the service will auto-detect X/Y from the dataset headers.",
    example: {
      title: "Sample Chart",
      width: 700,
      height: 300,
      margin: { top: 20, left: 50, right: 30, bottom: 40 },
    },
    required: true,
  })
  @ValidateNested()
  @Type(() => ChartConfigDto)
  config: ChartConfigDto;

  @ApiProperty({
    description: "ID of the dataset this chart belongs to",
    example: "clx1234567890abcdef",
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: "Dataset ID is required" })
  datasetId: string;
}

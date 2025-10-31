import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsIn,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
  Max,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";
import { object } from "joi";

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

export class MarginDto {}

export class ChartConfigDto {}

export class FormatterConfigDto {}

export class SeriesConfigDto {}

export class NestedChartConfigDto {}

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
      "Chart configuration with nested structure containing config, formatters and seriesConfigs.",
    example: {
      config: {
        title: "Sample Chart",
        width: 700,
        height: 300,
        margin: { top: 20, left: 50, right: 30, bottom: 40 },
      },
      formatters: {
        useYFormatter: true,
        useXFormatter: true,
        yFormatterType: "number",
        xFormatterType: "number",
        customYFormatter: "",
        customXFormatter: "",
      },
      seriesConfigs: [],
    },
    required: true,
  })
  @IsNotEmpty({ message: "Chart config is required" })
  @Type(() => Object)
  config: Object;

  @ApiProperty({
    description: "ID of the dataset this chart belongs to",
    example: "clx1234567890abcdef",
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: "Dataset ID is required" })
  datasetId: string;
}

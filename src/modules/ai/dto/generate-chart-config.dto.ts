import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsArray } from "class-validator";

export class GenerateChartConfigDto {
  @ApiProperty({
    description: "Natural language prompt describing the desired chart",
    example:
      "Create a line chart showing sales over time with a dark theme and smooth curves",
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: "Dataset ID to use for the chart",
    example: "cmfp0xm9v0001193gt2vmnyf4",
  })
  @IsString()
  @IsNotEmpty()
  datasetId: string;

  @ApiPropertyOptional({
    description:
      "Available headers from the dataset (will be fetched from backend if not provided)",
    example: [
      { id: "cmfp0xm9v0002193gt2vmnyf5", name: "month", type: "string" },
      { id: "cmfp0xm9v0003193g971yzucg", name: "sales", type: "number" },
    ],
  })
  @IsOptional()
  @IsArray()
  headers?: Array<{ id: string; name: string; type: string }>;

  @ApiPropertyOptional({
    description: "User ID for authorization (will be extracted from token)",
    example: "user-uuid",
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class GenerateChartConfigResponseDto {
  @ApiProperty({
    description: "Generated chart configuration",
    example: {
      title: "Sales Over Time",
      type: "line",
      width: 800,
      height: 400,
      config: {
        xAxisKey: "cmfp0xm9v0002193gt2vmnyf5",
        yAxisKeys: ["cmfp0xm9v0003193g971yzucg"],
        theme: "dark",
        showLegend: true,
        showGrid: true,
        lineType: "smooth",
      },
    },
  })
  config: any;

  @ApiProperty({
    description: "Chart type",
    example: "line",
  })
  type: string;

  @ApiProperty({
    description: "AI explanation of the generated config",
    example:
      "I created a line chart with sales data on the Y-axis and months on the X-axis. Applied dark theme as requested.",
  })
  explanation: string;

  @ApiProperty({
    description: "Suggested chart name",
    example: "Sales Over Time Analysis",
  })
  suggestedName: string;

  @ApiProperty({
    description: "URL to chart editor with this config",
    example: "/workspace/charts/editor?datasetId=xxx&config=base64...",
  })
  chartUrl: string;

  @ApiProperty({
    description: "Success status",
    example: true,
  })
  success: boolean;
}

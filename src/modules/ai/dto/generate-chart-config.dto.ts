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

/**
 * JSON Schema for AI Chart Config Generation Response
 * Used by OpenRouter API with structured output (json_schema mode)
 * 
 * This schema supports both flat (Line/Bar/Area/Scatter/Pie) and nested (Heatmap/CyclePlot/Histogram) structures
 */
export const CHART_CONFIG_JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "chart_config_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "line",
            "bar",
            "area",
            "pie",
            "donut",
            "scatter",
            "heatmap",
            "histogram",
            "cycleplot",
          ],
        },
        config: {
          type: "object",
          properties: {
            // Base config properties (common to all types)
            title: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            margin: {
              type: "object",
              properties: {
                top: { type: "number" },
                left: { type: "number" },
                right: { type: "number" },
                bottom: { type: "number" },
              },
              required: ["top", "left", "right", "bottom"],
              additionalProperties: false,
            },
            theme: { type: "string", enum: ["light", "dark"] },
            showLegend: { type: "boolean" },
            showGrid: { type: "boolean" },
            showTooltip: { type: "boolean" },
            animationDuration: { type: "number" },
            backgroundColor: { type: "string" },
            
            // For Line/Bar/Area/Scatter - flat structure (backwards compatible)
            xAxisKey: { type: "string" },
            yAxisKeys: {
              type: "array",
              items: { type: "string" },
            },
            xAxisLabel: { type: "string" },
            yAxisLabel: { type: "string" },
            
            // Line/Bar/Area specific
            lineType: {
              type: "string",
              enum: ["basic", "smooth", "stepped", "dashed"],
            },
            barType: {
              type: "string",
              enum: ["grouped", "stacked", "percentage"],
            },
            areaType: {
              type: "string",
              enum: ["basic", "stacked", "percentage", "stream"],
            },
            
            // Pie/Donut specific (uses config.labelKey, config.valueKey)
            labelKey: { type: "string" },
            valueKey: { type: "string" },
            pieType: {
              type: "string",
              enum: ["basic", "exploded", "nested"],
            },
            donutType: {
              type: "string",
              enum: ["basic", "multi-level", "progress"],
            },
            showLabels: { type: "boolean" },
            showPercentage: { type: "boolean" },
            
            // Heatmap specific
            colorScheme: {
              type: "string",
              enum: ["blues", "reds", "greens", "purples", "oranges", "greys", "viridis", "plasma", "inferno", "magma", "turbo", "cividis"],
            },
            showValues: { type: "boolean" },
            cellBorderWidth: { type: "number" },
            cellBorderColor: { type: "string" },
            
            // Histogram specific
            binCount: { type: "number" },
            binMethod: {
              type: "string",
              enum: ["count", "width", "sturges", "scott", "freedman-diaconis"],
            },
            showDensity: { type: "boolean" },
          },
          required: ["title", "width", "height", "margin"],
          additionalProperties: true,
        },
        // axisConfigs for Heatmap, CyclePlot, Histogram
        axisConfigs: {
          type: "object",
          properties: {
            // For Heatmap
            xAxisKey: { type: "string" },
            yAxisKey: { type: "string" },
            valueKey: { type: "string" },
            
            // For CyclePlot
            cycleKey: { type: "string" },
            periodKey: { type: "string" },
            
            // Axis labels
            xAxisLabel: { type: "string" },
            yAxisLabel: { type: "string" },
            
            // Series configs for Line/Bar/Area/Histogram
            seriesConfigs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  dataColumn: { type: "string" },
                  color: { type: "string" },
                  visible: { type: "boolean" },
                },
                required: ["id", "name", "dataColumn"],
                additionalProperties: true,
              },
            },
          },
          additionalProperties: true,
        },
        // formatters
        formatters: {
          type: "object",
          properties: {
            useValueFormatter: { type: "boolean" },
            useXFormatter: { type: "boolean" },
            useYFormatter: { type: "boolean" },
            valueFormatterType: {
              type: "string",
              enum: ["none", "number", "currency", "percentage", "decimal"],
            },
            xFormatterType: {
              type: "string",
              enum: ["none", "number", "currency", "percentage", "decimal", "date"],
            },
            yFormatterType: {
              type: "string",
              enum: ["none", "number", "currency", "percentage", "decimal"],
            },
          },
          additionalProperties: true,
        },
        explanation: { type: "string" },
        suggestedName: { type: "string" },
      },
      required: ["type", "config", "explanation", "suggestedName"],
      additionalProperties: false,
    },
  },
} as const;

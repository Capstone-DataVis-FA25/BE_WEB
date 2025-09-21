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
  IsBoolean,
  Min,
  Max,
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

  // ========================
  // ANIMATION SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "Animation duration in milliseconds",
    example: 1000,
    default: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5000)
  animationDuration?: number;

  // ========================
  // DISPLAY SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "Show chart legend",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showLegend?: boolean;

  @ApiPropertyOptional({
    description: "Show chart grid",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showGrid?: boolean;

  @ApiPropertyOptional({
    description: "Show data points (for line charts)",
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  showPoints?: boolean;

  @ApiPropertyOptional({
    description: "Show data values on chart",
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  showValues?: boolean;

  @ApiPropertyOptional({
    description: "Show tooltip on hover",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showTooltip?: boolean;

  @ApiPropertyOptional({
    description: "Enable zoom functionality",
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enableZoom?: boolean;

  @ApiPropertyOptional({
    description: "Enable pan functionality",
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enablePan?: boolean;

  // ========================
  // BAR CHART SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Bar chart type (grouped, stacked, etc.)",
    example: "grouped",
    enum: ["grouped", "stacked", "percentage"],
    default: "grouped",
  })
  @IsOptional()
  @IsString()
  @IsIn(["grouped", "stacked", "percentage"])
  barType?: string;

  @ApiPropertyOptional({
    description: "Bar width (0-1, where 1 = no gap)",
    example: 0.8,
    default: 0.8,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  barWidth?: number;

  @ApiPropertyOptional({
    description: "Gap between bar groups (0-1)",
    example: 0.2,
    default: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  barGap?: number;

  // ========================
  // LINE CHART SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Line chart type",
    example: "basic",
    enum: ["basic", "smooth", "stepped", "dashed"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "smooth", "stepped", "dashed"])
  lineType?: string;

  @ApiPropertyOptional({
    description: "Line curve type",
    example: "curveMonotoneX",
    enum: ["linear", "curveMonotoneX", "curveCardinal", "curveStep"],
    default: "curveMonotoneX",
  })
  @IsOptional()
  @IsString()
  @IsIn(["linear", "curveMonotoneX", "curveCardinal", "curveStep"])
  curveType?: string;

  @ApiPropertyOptional({
    description: "Line stroke width",
    example: 2,
    default: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  strokeWidth?: number;

  // ========================
  // AREA CHART SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Area chart type",
    example: "basic",
    enum: ["basic", "stacked", "percentage", "stream"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "stacked", "percentage", "stream"])
  areaType?: string;

  @ApiPropertyOptional({
    description: "Area fill opacity (0-1)",
    example: 0.6,
    default: 0.6,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fillOpacity?: number;

  // ========================
  // PIE/DONUT SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Pie chart type",
    example: "basic",
    enum: ["basic", "exploded", "nested"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "exploded", "nested"])
  pieType?: string;

  @ApiPropertyOptional({
    description: "Donut chart type",
    example: "basic",
    enum: ["basic", "multi-level", "progress"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "multi-level", "progress"])
  donutType?: string;

  @ApiPropertyOptional({
    description: "Inner radius for donut charts (0-100)",
    example: 50,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  innerRadius?: number;

  @ApiPropertyOptional({
    description: "Show labels on pie/donut slices",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showLabels?: boolean;

  @ApiPropertyOptional({
    description: "Show percentages on pie/donut slices",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showPercentages?: boolean;

  // ========================
  // SCATTER/BUBBLE SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Scatter plot type",
    example: "basic",
    enum: ["basic", "regression", "clustered"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "regression", "clustered"])
  scatterType?: string;

  @ApiPropertyOptional({
    description: "Bubble chart type",
    example: "basic",
    enum: ["basic", "packed", "force"],
    default: "basic",
  })
  @IsOptional()
  @IsString()
  @IsIn(["basic", "packed", "force"])
  bubbleType?: string;

  // ========================
  // HEATMAP SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Heatmap type",
    example: "grid",
    enum: ["grid", "calendar", "treemap"],
    default: "grid",
  })
  @IsOptional()
  @IsString()
  @IsIn(["grid", "calendar", "treemap"])
  heatmapType?: string;

  @ApiPropertyOptional({
    description: "Color scheme for heatmap",
    example: "blues",
    enum: ["blues", "greens", "reds", "oranges", "purples", "viridis"],
    default: "blues",
  })
  @IsOptional()
  @IsString()
  @IsIn(["blues", "greens", "reds", "oranges", "purples", "viridis"])
  colorScheme?: string;

  // ========================
  // RADAR SPECIFIC
  // ========================
  @ApiPropertyOptional({
    description: "Radar chart type",
    example: "polygon",
    enum: ["polygon", "circular", "spider"],
    default: "polygon",
  })
  @IsOptional()
  @IsString()
  @IsIn(["polygon", "circular", "spider"])
  radarType?: string;

  // ========================
  // ADVANCED CHART TYPES
  // ========================
  @ApiPropertyOptional({
    description: "Treemap type",
    example: "squarified",
    enum: ["squarified", "slice-dice", "binary"],
    default: "squarified",
  })
  @IsOptional()
  @IsString()
  @IsIn(["squarified", "slice-dice", "binary"])
  treemapType?: string;

  @ApiPropertyOptional({
    description: "Sankey diagram type",
    example: "horizontal",
    enum: ["horizontal", "vertical", "circular"],
    default: "horizontal",
  })
  @IsOptional()
  @IsString()
  @IsIn(["horizontal", "vertical", "circular"])
  sankeyType?: string;

  @ApiPropertyOptional({
    description: "Gauge chart type",
    example: "arc",
    enum: ["arc", "linear", "bullet"],
    default: "arc",
  })
  @IsOptional()
  @IsString()
  @IsIn(["arc", "linear", "bullet"])
  gaugeType?: string;

  @ApiPropertyOptional({
    description: "Funnel chart type",
    example: "pyramid",
    enum: ["pyramid", "inverted", "cylinder"],
    default: "pyramid",
  })
  @IsOptional()
  @IsString()
  @IsIn(["pyramid", "inverted", "cylinder"])
  funnelType?: string;

  @ApiPropertyOptional({
    description: "Waterfall chart type",
    example: "standard",
    enum: ["standard", "bridge", "variance"],
    default: "standard",
  })
  @IsOptional()
  @IsString()
  @IsIn(["standard", "bridge", "variance"])
  waterfallType?: string;

  // ========================
  // ADVANCED CHART PROPERTIES
  // ========================
  @ApiPropertyOptional({
    description: "Node width for Sankey diagrams",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(50)
  nodeWidth?: number;

  @ApiPropertyOptional({
    description: "Node padding for Sankey diagrams",
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  nodePadding?: number;

  @ApiPropertyOptional({
    description: "Minimum value for gauge charts",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional({
    description: "Maximum value for gauge charts",
    example: 100,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional({
    description: "Show threshold lines for gauge charts",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showThreshold?: boolean;

  @ApiPropertyOptional({
    description: "Show connectors for waterfall charts",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showConnectors?: boolean;

  @ApiPropertyOptional({
    description: "Show totals for waterfall charts",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showTotals?: boolean;

  @ApiPropertyOptional({
    description: "Tiling algorithm for treemap",
    example: "squarify",
    enum: ["squarify", "slice", "dice", "resquarify"],
    default: "squarify",
  })
  @IsOptional()
  @IsString()
  @IsIn(["squarify", "slice", "dice", "resquarify"])
  tiling?: string;

  // ========================
  // AXIS FORMATTING
  // ========================
  @ApiPropertyOptional({
    description: "X axis label rotation angle",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  xAxisRotation?: number;

  @ApiPropertyOptional({
    description: "Y axis label rotation angle",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  yAxisRotation?: number;

  @ApiPropertyOptional({
    description: "X axis formatter type",
    example: "auto",
    enum: ["auto", "number", "currency", "percentage", "date", "time"],
    default: "auto",
  })
  @IsOptional()
  @IsString()
  @IsIn(["auto", "number", "currency", "percentage", "date", "time"])
  xAxisFormatterType?: string;

  @ApiPropertyOptional({
    description: "Y axis formatter type",
    example: "number",
    enum: ["auto", "number", "currency", "percentage", "date", "time"],
    default: "number",
  })
  @IsOptional()
  @IsString()
  @IsIn(["auto", "number", "currency", "percentage", "date", "time"])
  yAxisFormatterType?: string;

  // ========================
  // COLOR SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "Chart background color",
    example: "#ffffff",
    default: "#ffffff",
  })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({
    description: "Grid color",
    example: "#e0e0e0",
    default: "#e0e0e0",
  })
  @IsOptional()
  @IsString()
  gridColor?: string;

  @ApiPropertyOptional({
    description: "Text color",
    example: "#333333",
    default: "#333333",
  })
  @IsOptional()
  @IsString()
  textColor?: string;

  @ApiPropertyOptional({
    description: "Custom color palette for series",
    example: ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colorPalette?: string[];

  // ========================
  // ZOOM & PAN SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "Zoom level (1 = normal, 2 = 2x zoom, etc.)",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  zoomLevel?: number;

  // ========================
  // TEXT & FONT SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "Chart title font size",
    example: 18,
    default: 18,
  })
  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(48)
  titleFontSize?: number;

  @ApiPropertyOptional({
    description: "Chart title font family",
    example: "Arial, sans-serif",
    default: "Arial, sans-serif",
  })
  @IsOptional()
  @IsString()
  titleFontFamily?: string;

  @ApiPropertyOptional({
    description: "Axis labels font size",
    example: 12,
    default: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(24)
  axisLabelFontSize?: number;

  @ApiPropertyOptional({
    description: "Axis labels font family",
    example: "Arial, sans-serif",
    default: "Arial, sans-serif",
  })
  @IsOptional()
  @IsString()
  axisLabelFontFamily?: string;

  @ApiPropertyOptional({
    description: "Legend font size",
    example: 12,
    default: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(20)
  legendFontSize?: number;

  @ApiPropertyOptional({
    description: "Legend font family",
    example: "Arial, sans-serif",
    default: "Arial, sans-serif",
  })
  @IsOptional()
  @IsString()
  legendFontFamily?: string;

  // ========================
  // LEGEND POSITIONING
  // ========================
  @ApiPropertyOptional({
    description: "Legend position",
    example: "right",
    enum: ["top", "bottom", "left", "right", "none"],
    default: "right",
  })
  @IsOptional()
  @IsString()
  @IsIn(["top", "bottom", "left", "right", "none"])
  legendPosition?: string;

  @ApiPropertyOptional({
    description: "Legend alignment",
    example: "center",
    enum: ["start", "center", "end"],
    default: "center",
  })
  @IsOptional()
  @IsString()
  @IsIn(["start", "center", "end"])
  legendAlignment?: string;

  @ApiPropertyOptional({
    description: "Legend size/width",
    example: 150,
    default: 150,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(500)
  legendSize?: number;

  // ========================
  // BORDER & VISUAL EFFECTS
  // ========================
  @ApiPropertyOptional({
    description: "Chart border width",
    example: 1,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  borderWidth?: number;

  @ApiPropertyOptional({
    description: "Chart border color",
    example: "#cccccc",
    default: "#cccccc",
  })
  @IsOptional()
  @IsString()
  borderColor?: string;

  @ApiPropertyOptional({
    description: "Enable shadow effect",
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  shadowEffect?: boolean;

  // ========================
  // AXIS RANGE & SCALE SETTINGS
  // ========================
  @ApiPropertyOptional({
    description: "X axis minimum value (auto if not set)",
    example: 0,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  xAxisMin?: number;

  @ApiPropertyOptional({
    description: "X axis maximum value (auto if not set)",
    example: 100,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  xAxisMax?: number;

  @ApiPropertyOptional({
    description: "Y axis minimum value (auto if not set)",
    example: 0,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  yAxisMin?: number;

  @ApiPropertyOptional({
    description: "Y axis maximum value (auto if not set)",
    example: 100,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  yAxisMax?: number;

  @ApiPropertyOptional({
    description: "X axis tick interval (auto if not set)",
    example: 10,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  xAxisTickInterval?: number;

  @ApiPropertyOptional({
    description: "Y axis tick interval (auto if not set)",
    example: 5,
    default: null,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  yAxisTickInterval?: number;

  @ApiPropertyOptional({
    description: "X axis scale type",
    example: "linear",
    enum: ["linear", "log", "time", "category"],
    default: "linear",
  })
  @IsOptional()
  @IsString()
  @IsIn(["linear", "log", "time", "category"])
  xAxisScale?: string;

  @ApiPropertyOptional({
    description: "Y axis scale type",
    example: "linear",
    enum: ["linear", "log", "time", "category"],
    default: "linear",
  })
  @IsOptional()
  @IsString()
  @IsIn(["linear", "log", "time", "category"])
  yAxisScale?: string;

  // ========================
  // PADDING & SPACING
  // ========================
  @ApiPropertyOptional({
    description: "Title padding from chart",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  titlePadding?: number;

  @ApiPropertyOptional({
    description: "Legend padding from chart",
    example: 15,
    default: 15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  legendPadding?: number;

  @ApiPropertyOptional({
    description: "Axis padding from chart area",
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  axisPadding?: number;
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

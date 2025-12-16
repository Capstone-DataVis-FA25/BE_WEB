import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsObject,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================================
// Common DTOs
// ============================================================

export class MarginDto {
  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0)
  top: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  left: number;

  @ApiProperty({ example: 30 })
  @IsNumber()
  @Min(0)
  right: number;

  @ApiProperty({ example: 40 })
  @IsNumber()
  @Min(0)
  bottom: number;
}

export class SeriesConfigDto {
  @ApiProperty({ example: 'series-1' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Sales' })
  @IsString()
  name: string;

  @ApiProperty({ example: '#3b82f6' })
  @IsString()
  color: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  visible: boolean;

  @ApiProperty({ example: 'cmfp0xm9v0003193g971yzucg', description: 'Header ID for data column' })
  @IsString()
  dataColumn: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  lineWidth?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  pointRadius?: number;

  @ApiPropertyOptional({ enum: ['solid', 'dashed', 'dotted'] })
  @IsOptional()
  @IsEnum(['solid', 'dashed', 'dotted'])
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export class AxisConfigDto {
  @ApiPropertyOptional({ example: 'cmfp0xm9v0002193gt2vmnyf5', description: 'Header ID for X-axis' })
  @IsOptional()
  @IsString()
  xAxisKey?: string;

  @ApiPropertyOptional({ example: 'Month' })
  @IsOptional()
  @IsString()
  xAxisLabel?: string;

  @ApiPropertyOptional({ example: 'Sales Amount' })
  @IsOptional()
  @IsString()
  yAxisLabel?: string;

  @ApiPropertyOptional({ enum: ['auto', 'zero'], example: 'auto' })
  @IsOptional()
  @IsEnum(['auto', 'zero'])
  xAxisStart?: 'auto' | 'zero';

  @ApiPropertyOptional({ enum: ['auto', 'zero'], example: 'zero' })
  @IsOptional()
  @IsEnum(['auto', 'zero'])
  yAxisStart?: 'auto' | 'zero';

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  xAxisRotation?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  yAxisRotation?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showAxisLabels?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showAxisTicks?: boolean;

  @ApiPropertyOptional({ type: [SeriesConfigDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeriesConfigDto)
  seriesConfigs?: SeriesConfigDto[];
}

// ============================================================
// LINE CHART CONFIG DTO
// ============================================================

export class LineChartConfigDto {
  @ApiProperty({ example: 'line' })
  @IsString()
  chartType: 'line';

  @ApiProperty({ example: 800 })
  @IsNumber()
  @Min(100)
  @Max(4000)
  width: number;

  @ApiProperty({ example: 400 })
  @IsNumber()
  @Min(100)
  @Max(4000)
  height: number;

  @ApiProperty({ type: MarginDto })
  @ValidateNested()
  @Type(() => MarginDto)
  margin: MarginDto;

  @ApiProperty({ example: 'Sales Trend Analysis' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'cmfp0xm9v0002193gt2vmnyf5', description: 'Header ID for X-axis' })
  @IsString()
  xAxisKey: string;

  @ApiProperty({
    example: ['cmfp0xm9v0003193g971yzucg'],
    description: 'Array of header IDs for Y-axis series',
  })
  @IsArray()
  @IsString({ each: true })
  yAxisKeys: string[];

  @ApiPropertyOptional({ example: [], description: 'Array of disabled line IDs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledLines?: string[];

  @ApiProperty({ example: 'Month' })
  @IsString()
  xAxisLabel: string;

  @ApiProperty({ example: 'Sales (USD)' })
  @IsString()
  yAxisLabel: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPoints?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showPointValues?: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  animationDuration: number;

  @ApiPropertyOptional({ enum: ['curveLinear', 'curveMonotoneX', 'curveBasis'] })
  @IsOptional()
  @IsString()
  curve?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  lineWidth?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  pointRadius?: number;

  @ApiPropertyOptional({ enum: ['solid', 'dashed', 'dotted'] })
  @IsOptional()
  @IsEnum(['solid', 'dashed', 'dotted'])
  lineStyle?: 'solid' | 'dashed' | 'dotted';

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  @Min(0)
  @Max(1)
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  xAxisStart: 'auto' | 'zero';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  yAxisStart: 'auto' | 'zero';

  @ApiProperty({ example: 0 })
  @IsNumber()
  xAxisRotation: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  yAxisRotation: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisLabels: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisTicks: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enableZoom: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enablePan: boolean;

  @ApiProperty({ example: 10 })
  @IsNumber()
  zoomExtent: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showTooltip: boolean;

  @ApiProperty({ enum: ['light', 'dark', 'auto'] })
  @IsEnum(['light', 'dark', 'auto'])
  theme: 'light' | 'dark' | 'auto';

  @ApiProperty({ example: '' })
  @IsString()
  backgroundColor: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  titleFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  labelFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  legendFontSize: number;

  @ApiPropertyOptional({ type: AxisConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AxisConfigDto)
  axisConfigs?: AxisConfigDto;
}

// ============================================================
// BAR CHART CONFIG DTO
// ============================================================

export class BarChartConfigDto {
  @ApiProperty({ example: 'bar' })
  @IsString()
  chartType: 'bar';

  @ApiProperty({ example: 800 })
  @IsNumber()
  @Min(100)
  @Max(4000)
  width: number;

  @ApiProperty({ example: 400 })
  @IsNumber()
  @Min(100)
  @Max(4000)
  height: number;

  @ApiProperty({ type: MarginDto })
  @ValidateNested()
  @Type(() => MarginDto)
  margin: MarginDto;

  @ApiProperty({ example: 'Sales by Category' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'cmfp0xm9v0002193gt2vmnyf5' })
  @IsString()
  xAxisKey: string;

  @ApiProperty({ example: ['cmfp0xm9v0003193g971yzucg'] })
  @IsArray()
  @IsString({ each: true })
  yAxisKeys: string[];

  @ApiPropertyOptional({ example: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledBars?: string[];

  @ApiProperty({ example: 'Category' })
  @IsString()
  xAxisLabel: string;

  @ApiProperty({ example: 'Amount' })
  @IsString()
  yAxisLabel: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  showPoints: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showPointValues: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiProperty({ enum: ['grouped', 'stacked', 'diverging'] })
  @IsEnum(['grouped', 'stacked', 'diverging'])
  barType: 'grouped' | 'stacked' | 'diverging';

  @ApiProperty({ example: 0.8 })
  @IsNumber()
  @Min(0.1)
  @Max(1)
  barWidth: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  @Min(0)
  @Max(1)
  barSpacing: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  xAxisStart: 'auto' | 'zero';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  yAxisStart: 'auto' | 'zero';

  @ApiProperty({ example: 0 })
  @IsNumber()
  xAxisRotation: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  yAxisRotation: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisLabels: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisTicks: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enableZoom: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enablePan: boolean;

  @ApiProperty({ example: 10 })
  @IsNumber()
  zoomExtent: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showTooltip: boolean;

  @ApiProperty({ enum: ['light', 'dark', 'auto'] })
  @IsEnum(['light', 'dark', 'auto'])
  theme: 'light' | 'dark' | 'auto';

  @ApiProperty({ example: '' })
  @IsString()
  backgroundColor: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  titleFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  labelFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  legendFontSize: number;

  @ApiPropertyOptional({ type: AxisConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AxisConfigDto)
  axisConfigs?: AxisConfigDto;
}

// ============================================================
// AREA CHART CONFIG DTO
// ============================================================

export class AreaChartConfigDto {
  @ApiProperty({ example: 'area' })
  @IsString()
  chartType: 'area';

  @ApiProperty({ example: 800 })
  @IsNumber()
  width: number;

  @ApiProperty({ example: 400 })
  @IsNumber()
  height: number;

  @ApiProperty({ type: MarginDto })
  @ValidateNested()
  @Type(() => MarginDto)
  margin: MarginDto;

  @ApiProperty({ example: 'Revenue Over Time' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'cmfp0xm9v0002193gt2vmnyf5' })
  @IsString()
  xAxisKey: string;

  @ApiProperty({ example: ['cmfp0xm9v0003193g971yzucg'] })
  @IsArray()
  @IsString({ each: true })
  yAxisKeys: string[];

  @ApiProperty({ example: 'Month' })
  @IsString()
  xAxisLabel: string;

  @ApiProperty({ example: 'Revenue' })
  @IsString()
  yAxisLabel: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showStroke?: boolean;

  @ApiPropertyOptional({ example: 'curveMonotoneX' })
  @IsOptional()
  @IsString()
  curve?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  lineWidth?: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  xAxisStart: 'auto' | 'zero';

  @ApiProperty({ enum: ['auto', 'zero'] })
  @IsEnum(['auto', 'zero'])
  yAxisStart: 'auto' | 'zero';

  @ApiProperty({ example: 0 })
  @IsNumber()
  xAxisRotation: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  yAxisRotation: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisLabels: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showAxisTicks: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enableZoom: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  enablePan: boolean;

  @ApiProperty({ example: 10 })
  @IsNumber()
  zoomExtent: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showTooltip: boolean;

  @ApiProperty({ enum: ['light', 'dark', 'auto'] })
  @IsEnum(['light', 'dark', 'auto'])
  theme: 'light' | 'dark' | 'auto';

  @ApiProperty({ example: '' })
  @IsString()
  backgroundColor: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  titleFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  labelFontSize: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  legendFontSize: number;

  @ApiPropertyOptional({ type: AxisConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AxisConfigDto)
  axisConfigs?: AxisConfigDto;
}

// Export all DTOs
export type ChartConfigDto = LineChartConfigDto | BarChartConfigDto | AreaChartConfigDto;

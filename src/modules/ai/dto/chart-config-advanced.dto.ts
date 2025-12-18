import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MarginDto, AxisConfigDto } from './chart-config.dto';

// ============================================================
// SCATTER CHART CONFIG DTO
// ============================================================

export class ScatterChartConfigDto {
  @ApiProperty({ example: 'scatter' })
  @IsString()
  chartType: 'scatter';

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

  @ApiProperty({ example: 'Price vs Quality Correlation' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'cmfp0xm9v0002193gt2vmnyf5', description: 'X-axis header ID (numeric)' })
  @IsString()
  xAxisKey: string;

  @ApiProperty({ example: ['cmfp0xm9v0003193g971yzucg'], description: 'Y-axis header IDs (numeric)' })
  @IsString({ each: true })
  yAxisKeys: string[];

  @ApiProperty({ example: 'Price' })
  @IsString()
  xAxisLabel: string;

  @ApiProperty({ example: 'Quality Score' })
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

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  pointRadius?: number;

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
// PIE/DONUT CHART CONFIG DTO
// ============================================================

export class PieDonutConfigDto {
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

  @ApiProperty({ example: 'Sales Distribution' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'cmfp0xm9v0002193gt2vmnyf5', description: 'Label column header ID' })
  @IsString()
  labelKey: string;

  @ApiProperty({ example: 'cmfp0xm9v0003193g971yzucg', description: 'Value column header ID' })
  @IsString()
  valueKey: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showLabels?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPercentage?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSliceValues?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableAnimation?: boolean;

  @ApiPropertyOptional({ example: 0, description: '0 for pie, > 0 for donut' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.9)
  innerRadius?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  cornerRadius?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  padAngle?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  startAngle?: number;

  @ApiPropertyOptional({ example: 360 })
  @IsOptional()
  @IsNumber()
  endAngle?: number;

  @ApiPropertyOptional({ enum: ['ascending', 'descending', 'none'] })
  @IsOptional()
  @IsEnum(['ascending', 'descending', 'none'])
  sortSlices?: 'ascending' | 'descending' | 'none';

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

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
}

export class PieChartConfigDto extends PieDonutConfigDto {
  @ApiProperty({ example: 'pie' })
  @IsString()
  chartType: 'pie';
}

export class DonutChartConfigDto extends PieDonutConfigDto {
  @ApiProperty({ example: 'donut' })
  @IsString()
  chartType: 'donut';
}

// ============================================================
// HISTOGRAM CHART CONFIG DTO
// ============================================================

export class HistogramChartConfigDto {
  @ApiProperty({ example: 'histogram' })
  @IsString()
  chartType: 'histogram';

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

  @ApiProperty({ example: 'Age Distribution' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  binCount?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  binWidth?: number;

  @ApiPropertyOptional({
    enum: ['count', 'width', 'sturges', 'scott', 'freedman-diaconis'],
    example: 'sturges',
  })
  @IsOptional()
  @IsEnum(['count', 'width', 'sturges', 'scott', 'freedman-diaconis'])
  binMethod?: 'count' | 'width' | 'sturges' | 'scott' | 'freedman-diaconis';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showDensity?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showCumulativeFrequency?: boolean;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  barColor?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showMean?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showMedian?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPointValues?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  normalize?: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

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
// HEATMAP CHART CONFIG DTO
// ============================================================

export class HeatmapAxisConfigDto extends AxisConfigDto {
  @ApiPropertyOptional({ example: 'cmfp0xm9v0002193gt2vmnyf5' })
  @IsOptional()
  @IsString()
  xAxisKey?: string;

  @ApiPropertyOptional({ example: 'cmfp0xm9v0003193g971yzucg' })
  @IsOptional()
  @IsString()
  yAxisKey?: string;

  @ApiPropertyOptional({ example: 'cmfp0xm9v0004193g971yzucd' })
  @IsOptional()
  @IsString()
  valueKey?: string;
}

export class HeatmapChartConfigDto {
  @ApiProperty({ example: 'heatmap' })
  @IsString()
  chartType: 'heatmap';

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

  @ApiProperty({ example: 'Sales Heatmap by Region and Month' })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    enum: [
      'blues',
      'reds',
      'greens',
      'purples',
      'oranges',
      'greys',
      'viridis',
      'plasma',
      'inferno',
      'magma',
      'turbo',
      'cividis',
    ],
    example: 'viridis',
  })
  @IsOptional()
  @IsEnum([
    'blues',
    'reds',
    'greens',
    'purples',
    'oranges',
    'greys',
    'viridis',
    'plasma',
    'inferno',
    'magma',
    'turbo',
    'cividis',
  ])
  colorScheme?:
    | 'blues'
    | 'reds'
    | 'greens'
    | 'purples'
    | 'oranges'
    | 'greys'
    | 'viridis'
    | 'plasma'
    | 'inferno'
    | 'magma'
    | 'turbo'
    | 'cividis';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showValues?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  cellBorderWidth?: number;

  @ApiPropertyOptional({ example: '#fff' })
  @IsOptional()
  @IsString()
  cellBorderColor?: string;

  @ApiPropertyOptional({ enum: ['center', 'top', 'bottom'] })
  @IsOptional()
  @IsEnum(['center', 'top', 'bottom'])
  valuePosition?: 'center' | 'top' | 'bottom';

  @ApiPropertyOptional({ example: 'auto' })
  @IsOptional()
  minValue?: number | 'auto';

  @ApiPropertyOptional({ example: 'auto' })
  @IsOptional()
  maxValue?: number | 'auto';

  @ApiPropertyOptional({ example: '#e0e0e0' })
  @IsOptional()
  @IsString()
  nullColor?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  legendSteps?: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

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

  @ApiPropertyOptional({ type: HeatmapAxisConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeatmapAxisConfigDto)
  axisConfigs?: HeatmapAxisConfigDto;
}

// ============================================================
// CYCLEPLOT CHART CONFIG DTO
// ============================================================

export class CyclePlotAxisConfigDto extends AxisConfigDto {
  @ApiPropertyOptional({ example: 'cmfp0xm9v0002193gt2vmnyf5', description: 'Cycle column ID (e.g., year)' })
  @IsOptional()
  @IsString()
  cycleKey?: string;

  @ApiPropertyOptional({
    example: 'cmfp0xm9v0003193g971yzucg',
    description: 'Period column ID (e.g., month)',
  })
  @IsOptional()
  @IsString()
  periodKey?: string;

  @ApiPropertyOptional({ example: 'cmfp0xm9v0004193g971yzucd', description: 'Value column ID' })
  @IsOptional()
  @IsString()
  valueKey?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showAverageLine?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  emphasizeLatestCycle?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showRangeBand?: boolean;

  @ApiPropertyOptional({ enum: ['auto', 'custom'] })
  @IsOptional()
  @IsEnum(['auto', 'custom'])
  periodOrdering?: 'auto' | 'custom';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showTooltipDelta?: boolean;
}

export class CyclePlotChartConfigDto {
  @ApiProperty({ example: 'cycleplot' })
  @IsString()
  chartType: 'cycleplot';

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

  @ApiProperty({ example: 'Monthly Sales Cycle Plot' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPoints?: boolean;

  @ApiPropertyOptional({ example: 'curveMonotoneX' })
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

  @ApiProperty({ example: true })
  @IsBoolean()
  showLegend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  showGrid: boolean;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  animationDuration: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  gridOpacity: number;

  @ApiProperty({ enum: ['top', 'bottom', 'left', 'right'] })
  @IsEnum(['top', 'bottom', 'left', 'right'])
  legendPosition: 'top' | 'bottom' | 'left' | 'right';

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

  @ApiPropertyOptional({ type: CyclePlotAxisConfigDto })
  @IsOptional()
  @ValidateNested()
 @Type(() => CyclePlotAxisConfigDto)
  axisConfigs?: CyclePlotAxisConfigDto;
}

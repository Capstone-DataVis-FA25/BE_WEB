import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateChartDto } from "./dto/create-chart.dto";
import { parseChartSpecificConfig } from "@modules/charts/helpers/chart-config.helper";

@Injectable()
export class ChartService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createChartDto: CreateChartDto, userId: string) {
    const { name, description, type, config, datasetId } = createChartDto;

    // Verify that the dataset exists and belongs to the user
    const dataset = await this.prismaService.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException("Dataset not found");
    }

    if (dataset.userId !== userId) {
      throw new ForbiddenException("You do not have access to this dataset");
    }

    // Load all headers for this dataset to resolve selectors
    const headers = await this.prismaService.prisma.dataHeader.findMany({
      where: { datasetId },
      orderBy: { index: "asc" },
      select: { id: true, name: true, index: true, type: true },
    });

    if (!headers || headers.length === 0) {
      throw new BadRequestException("Dataset has no headers to build chart");
    }

    // Resolve X header ID: prefer xAxisKey, then index, then name; if none, auto-detect
    let resolvedXId: string | undefined = config?.xAxisKey;
    if (!resolvedXId && typeof config?.xAxisIndex === "number") {
      const byIndex = headers.find((h) => h.index === config.xAxisIndex);
      resolvedXId = byIndex?.id;
    }
    if (!resolvedXId && config?.xAxisName) {
      const byName = headers.find((h) => h.name === config.xAxisName);
      resolvedXId = byName?.id;
    }
    if (!resolvedXId) {
      // Auto-detect X: prefer first non-numeric column (e.g., string/date). Fallback to first header.
      const nonNumeric = headers.find(
        (h) => h.type && h.type.toLowerCase() !== "number"
      );
      resolvedXId = (nonNumeric || headers[0]).id;
    }

    // Resolve Y header IDs: prefer yAxisKeys, then indices, then names; if none, auto-detect
    let resolvedYIds: string[] | undefined =
      Array.isArray(config?.yAxisKeys) && config.yAxisKeys.length > 0
        ? config.yAxisKeys
        : undefined;
    if (!resolvedYIds && Array.isArray(config?.yAxisIndices)) {
      resolvedYIds = config.yAxisIndices
        .map((idx) => headers.find((h) => h.index === idx)?.id)
        .filter((id): id is string => Boolean(id));
    }
    if (!resolvedYIds && Array.isArray(config?.yAxisNames)) {
      resolvedYIds = config.yAxisNames
        .map((nm) => headers.find((h) => h.name === nm)?.id)
        .filter((id): id is string => Boolean(id));
    }
    if (!resolvedYIds || resolvedYIds.length === 0) {
      // Auto-detect Y: pick numeric columns excluding X; if none numeric, pick all except X
      const xId = resolvedXId;
      const numericYs = headers
        .filter(
          (h) => h.id !== xId && h.type && h.type.toLowerCase() === "number"
        )
        .map((h) => h.id);
      resolvedYIds =
        numericYs.length > 0
          ? numericYs
          : headers.filter((h) => h.id !== xId).map((h) => h.id);
      if (!resolvedYIds || resolvedYIds.length === 0) {
        throw new BadRequestException(
          "Unable to auto-detect yAxis from dataset headers"
        );
      }
    }

    // Validate resolved IDs belong to dataset
    const xExists = headers.some((h) => h.id === resolvedXId);
    if (!xExists) {
      throw new BadRequestException("xAxisKey does not exist in this dataset");
    }
    const yValidCount = resolvedYIds.filter((id) =>
      headers.some((h) => h.id === id)
    ).length;
    if (yValidCount !== resolvedYIds.length) {
      throw new BadRequestException(
        "One or more yAxisKeys do not exist in this dataset"
      );
    }

    // Derive axis labels from headers when not provided
    const xHeaderMeta = headers.find((h) => h.id === resolvedXId);
    const yHeaderMetas = headers.filter((h) => resolvedYIds.includes(h.id));
    const derivedXAxisLabel = config.xAxisLabel ?? xHeaderMeta?.name ?? "X";
    const derivedYAxisLabels =
      Array.isArray(config["yAxisLabels"]) &&
      (config as any)["yAxisLabels"].length > 0
        ? (config as any)["yAxisLabels"]
        : yHeaderMetas.map((h) => h.name || "").filter(Boolean);
    const derivedYAxisLabel =
      config.yAxisLabel ??
      (derivedYAxisLabels.length > 0 ? derivedYAxisLabels.join(", ") : "Y");

    // Get chart-specific configuration based on chart type
    const chartSpecificConfig = parseChartSpecificConfig(type, config);

    // Build sanitized config for storage: include resolved IDs and ALL configuration settings
    const sanitizedConfig = {
      // Basic chart info
      title: config.title,
      width: config.width,
      height: config.height,
      margin: config.margin,

      // Resolved axis IDs
      xAxisKey: resolvedXId,
      yAxisKeys: resolvedYIds,
      xAxisLabel: derivedXAxisLabel,
      yAxisLabel: derivedYAxisLabel,
      yAxisLabels: derivedYAxisLabels,

      // Animation settings
      animationDuration: config.animationDuration ?? 1000,

      // Display settings (with chart-type specific overrides)
      showLegend: config.showLegend ?? true,
      showGrid: config.showGrid ?? true,
      showPoints: chartSpecificConfig.showPoints ?? config.showPoints ?? false,
      showValues: chartSpecificConfig.showValues ?? config.showValues ?? false,
      showTooltip: config.showTooltip ?? true,
      enableZoom: config.enableZoom ?? false,
      enablePan: config.enablePan ?? false,

      // Chart-type specific settings (only include relevant ones for this chart type)
      ...chartSpecificConfig,

      // Axis formatting
      xAxisRotation: config.xAxisRotation ?? 0,
      yAxisRotation: config.yAxisRotation ?? 0,
      xAxisFormatterType: config.xAxisFormatterType ?? "auto",
      yAxisFormatterType: config.yAxisFormatterType ?? "number",

      // Colors
      backgroundColor: config.backgroundColor ?? "#ffffff",
      gridColor: config.gridColor ?? "#e0e0e0",
      textColor: config.textColor ?? "#333333",
      colorPalette: config.colorPalette ?? [
        "#3b82f6",
        "#ef4444",
        "#10b981",
        "#f59e0b",
        "#8b5cf6",
        "#f97316",
      ],

      // Zoom & pan
      zoomLevel: config.zoomLevel ?? 1,

      // Text & Font settings
      titleFontSize: config.titleFontSize ?? 18,
      titleFontFamily: config.titleFontFamily ?? "Arial, sans-serif",
      axisLabelFontSize: config.axisLabelFontSize ?? 12,
      axisLabelFontFamily: config.axisLabelFontFamily ?? "Arial, sans-serif",
      legendFontSize: config.legendFontSize ?? 12,
      legendFontFamily: config.legendFontFamily ?? "Arial, sans-serif",

      // Legend positioning
      legendPosition: config.legendPosition ?? "right",
      legendAlignment: config.legendAlignment ?? "center",
      legendSize: config.legendSize ?? 150,

      // Border & Visual effects
      borderWidth: config.borderWidth ?? 0,
      borderColor: config.borderColor ?? "#cccccc",
      shadowEffect: config.shadowEffect ?? false,

      // Axis range & scale settings
      xAxisMin: config.xAxisMin ?? null,
      xAxisMax: config.xAxisMax ?? null,
      yAxisMin: config.yAxisMin ?? null,
      yAxisMax: config.yAxisMax ?? null,
      xAxisTickInterval: config.xAxisTickInterval ?? null,
      yAxisTickInterval: config.yAxisTickInterval ?? null,
      xAxisScale: config.xAxisScale ?? "linear",
      yAxisScale: config.yAxisScale ?? "linear",

      // Padding & Spacing
      titlePadding: config.titlePadding ?? 20,
      legendPadding: config.legendPadding ?? 15,
      axisPadding: config.axisPadding ?? 10,
    };

    // Database operation with error handling
    try {
      return await this.prismaService.prisma.chart.create({
        data: {
          userId,
          datasetId,
          name,
          description: description || null,
          type,
          config: sanitizedConfig as unknown as any, // Prisma Json type accepts object
        },
      });
    } catch (error) {
      if (error.code === "P2002") {
        // Unique constraint violation
        throw new HttpException(
          "A chart with this name already exists",
          HttpStatus.CONFLICT
        );
      }
      if (error.code === "P2003") {
        throw new BadRequestException("Invalid user or dataset ID");
      }
      throw new BadRequestException(`Failed to create chart: ${error.message}`);
    }
  }

  async findAll(userId: string) {
    try {
      const charts = await this.prismaService.prisma.chart.findMany({
        where: { userId },
        include: {
          dataset: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return charts;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch charts: ${error.message}`);
    }
  }

  async findOne(id: string, userId: string) {
    try {
      const chart = await this.prismaService.prisma.chart.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          dataset: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!chart) {
        throw new NotFoundException("Chart not found");
      }

      if (chart.userId !== userId) {
        throw new ForbiddenException("You do not have access to this chart");
      }

      // config is stored as Prisma Json; return as-is
      return chart;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch chart: ${error.message}`);
    }
  }

  async remove(id: string, userId: string) {
    try {
      // First validate ownership
      await this.validateOwnership(id, userId);

      await this.prismaService.prisma.chart.delete({
        where: { id },
      });

      return { message: "Chart deleted successfully" };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete chart: ${error.message}`);
    }
  }

  // Helper method to validate chart ownership
  private async validateOwnership(chartId: string, userId: string) {
    const chart = await this.prismaService.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chart) {
      throw new NotFoundException("Chart not found");
    }

    if (chart.userId !== userId) {
      throw new ForbiddenException("You do not have access to this chart");
    }

    return chart;
  }
}

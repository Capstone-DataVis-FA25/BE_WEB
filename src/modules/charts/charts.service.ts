import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateChartDto } from "./dto/create-chart.dto";
import { UpdateChartDto } from "./dto/update-chart.dto";
import { DatasetsService } from "@modules/datasets/datasets.service";
import { parseChartSpecificConfig } from "./helpers/chart-config.helper";

@Injectable()
export class ChartsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly datasetService: DatasetsService
  ) {}

  async findAll(userId: string) {
    try {
      const charts = await this.prismaService.prisma.chart.findMany({
        where: { userId },
        include: {
          dataset: {
            include: {
              headers: {
                orderBy: { index: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Enhance each chart with resolved axis names
      const enhancedCharts = charts.map((chart) =>
        this.enhanceChartWithAxisNames(chart)
      );

      return enhancedCharts;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch charts: ${error.message}`);
    }
  }

  async findByDataset(datasetId: string, userId: string) {
    try {
      // First, verify that the dataset belongs to the user
      await this.datasetService.validateOwnership(datasetId, userId);

      const charts = await this.prismaService.prisma.chart.findMany({
        where: {
          datasetId,
          userId,
        },
        include: {
          dataset: {
            include: {
              headers: {
                orderBy: { index: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Enhance each chart with resolved axis names
      const enhancedCharts = charts.map((chart) =>
        this.enhanceChartWithAxisNames(chart)
      );

      return enhancedCharts;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to fetch charts for dataset: ${error.message}`
      );
    }
  }

  async findOne(id: string, userId: string) {
    try {
      const chart = await this.prismaService.prisma.chart.findUnique({
        where: { id },
        include: {
          dataset: {
            include: {
              headers: {
                orderBy: { index: "asc" },
              },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
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

      // Enhance chart response with resolved axis names
      const enhancedChart = this.enhanceChartWithAxisNames(chart);

      return enhancedChart;
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

  async create(createChartDto: CreateChartDto, userId: string) {
    const { name, description, type, config, datasetId } = createChartDto;

    // Extract nested config structure
    const chartConfig = config.config;
    const formatters = config.formatters;
    const seriesConfigs = config.seriesConfigs || [];

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
    let resolvedXId: string | undefined = chartConfig?.xAxisKey;
    if (!resolvedXId && typeof chartConfig?.xAxisIndex === "number") {
      const byIndex = headers.find((h) => h.index === chartConfig.xAxisIndex);
      resolvedXId = byIndex?.id;
    }
    if (!resolvedXId && chartConfig?.xAxisName) {
      const byName = headers.find((h) => h.name === chartConfig.xAxisName);
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
      Array.isArray(chartConfig?.yAxisKeys) && chartConfig.yAxisKeys.length > 0
        ? chartConfig.yAxisKeys
        : undefined;
    if (!resolvedYIds && Array.isArray(chartConfig?.yAxisIndices)) {
      resolvedYIds = chartConfig.yAxisIndices
        .map((idx) => headers.find((h) => h.index === idx)?.id)
        .filter((id): id is string => Boolean(id));
    }
    if (!resolvedYIds && Array.isArray(chartConfig?.yAxisNames)) {
      resolvedYIds = chartConfig.yAxisNames
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
    const derivedXAxisLabel =
      chartConfig.xAxisLabel ?? xHeaderMeta?.name ?? "X";
    const derivedYAxisLabels =
      Array.isArray((chartConfig as any)["yAxisLabels"]) &&
      (chartConfig as any)["yAxisLabels"].length > 0
        ? (chartConfig as any)["yAxisLabels"]
        : yHeaderMetas.map((h) => h.name || "").filter(Boolean);
    const derivedYAxisLabel =
      chartConfig.yAxisLabel ??
      (derivedYAxisLabels.length > 0 ? derivedYAxisLabels.join(", ") : "Y");

    // Build sanitized config for storage: preserve full nested structure from frontend
    const sanitizedConfig = {
      // Main chart config with resolved axis IDs
      config: {
        ...chartConfig,
        // Override with resolved axis IDs
        xAxisKey: resolvedXId,
        yAxisKeys: resolvedYIds,
        xAxisLabel: derivedXAxisLabel,
        yAxisLabel: derivedYAxisLabel,
        yAxisLabels: derivedYAxisLabels,
      },
      // Preserve formatters from frontend
      formatters: formatters,
      // Preserve seriesConfigs from frontend
      seriesConfigs: seriesConfigs,
    } as any;

    // Database operation with error handling
    try {
      return await this.prismaService.prisma.chart.create({
        data: {
          userId,
          datasetId,
          name,
          description: description || null,
          type,
          config: sanitizedConfig as unknown as any,
        },
      });
    } catch (error) {
      if ((error as any).code === "P2002") {
        // Unique constraint violation
        throw new HttpException(
          "A chart with this name already exists",
          HttpStatus.CONFLICT
        );
      }
      if ((error as any).code === "P2003") {
        throw new BadRequestException("Invalid user or dataset ID");
      }
      throw new BadRequestException(
        `Failed to create chart: ${(error as any).message}`
      );
    }
  }

  async update(id: string, updateChartDto: UpdateChartDto, userId: string) {
    try {
      // First validate ownership
      await this.validateOwnership(id, userId);

      // If datasetId is being updated, verify access to the new dataset
      if (updateChartDto.datasetId) {
        const dataset = await this.prismaService.prisma.dataset.findUnique({
          where: { id: updateChartDto.datasetId },
        });

        if (!dataset) {
          throw new NotFoundException("Dataset not found");
        }

        if (dataset.userId !== userId) {
          throw new ForbiddenException(
            "You do not have access to this dataset"
          );
        }
      }

      // Frontend sends complete config, no need for backend defaults

      const updatedChart = await this.prismaService.prisma.chart.update({
        where: { id },
        data: updateChartDto,
        include: {
          dataset: {
            include: {
              headers: {
                orderBy: { index: "asc" },
              },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return updatedChart;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to update chart: ${error.message}`);
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

  // Helper method to enhance chart with resolved axis names
  private enhanceChartWithAxisNames(chart: any) {
    try {
      // Check if chart has config and dataset headers
      if (!chart.config || !chart.dataset?.headers) {
        return chart;
      }

      const config = chart.config;
      const headers = chart.dataset.headers;

      console.log("headers", headers);
      console.log("original config", config);

      // Create a map of header ID to header name for quick lookup
      const headerMap = new Map<string, string>();
      headers.forEach((header) => {
        headerMap.set(header.id, header.name);
      });
      // Print headerMap
      console.log("headerMap", headerMap);

      // Create enhanced config with resolved names
      const enhancedConfig = { ...config };

      // Replace xAxisKey UUID with header name
      if (config.config?.xAxisKey && headerMap.has(config.config.xAxisKey)) {
        console.log("xAxisKey", config.config.xAxisKey);
        enhancedConfig.config.xAxisKey = headerMap.get(config.config.xAxisKey);
      }

      // Replace yAxisKeys UUIDs with header names
      if (config.config?.yAxisKeys && Array.isArray(config.config.yAxisKeys)) {
        enhancedConfig.config.yAxisKeys = config.config.yAxisKeys.map((key) =>
          headerMap.has(key) ? headerMap.get(key) : key
        );
      }

      console.log("enhanced config", enhancedConfig);

      // Return chart with enhanced config and additional metadata
      return {
        ...chart,
        config: enhancedConfig,
        originalAxisIds: {
          xAxisKey: config.config?.xAxisKey,
          yAxisKeys: config.config?.yAxisKeys,
        },
      };
    } catch (error) {
      // If enhancement fails, return original chart
      console.warn("Failed to enhance chart with axis names:", error.message);
      return chart;
    }
  }
}

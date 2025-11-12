import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateChartDto } from "./dto/create-chart.dto";
import { UpdateChartDto } from "./dto/update-chart.dto";
import { DatasetsService } from "@modules/datasets/datasets.service";
import { parseChartSpecificConfig } from "./helpers/chart-config.helper";
import { Messages } from "src/constant/message-config";
import { ChartHistoryService } from "@modules/chart-history/chart-history.service";
import * as moment from 'moment-timezone';

@Injectable()
export class ChartsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly datasetService: DatasetsService,
    @Inject(forwardRef(() => ChartHistoryService))
    private readonly chartHistoryService: ChartHistoryService,
  ) {}

  async findAll(userId: string) {
    try {
      const charts = await this.prismaService.prisma.chart.findMany({
        where: { userId },
        include: {
          dataset: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return charts;
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
    console.log("Creating chart with config:", config);
    // Database operation with error handling
    try {
      return await this.prismaService.prisma.chart.create({
        data: {
          userId,
          datasetId,
          name,
          description: description || null,
          type,
          config: config
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

      const createdAt = new Date();

      // Extract imageUrl from updateChartDto if provided
      const { imageUrl, ...updateData } = updateChartDto as any;
      
      // Tạo snapshot lịch sử trước khi update
      await this.chartHistoryService.createHistorySnapshot(
        id,
        userId,
        `Restore before update: ${moment(createdAt).format('HH:mm:ss - DD.MM.YYYY')}`,
        imageUrl,
      );

      console.log('Updating chart with config:', updateData.config);
      // Frontend sends complete config, no need for backend defaults
      const updatedChart = await this.prismaService.prisma.chart.update({
        where: { id },
        data: updateData,
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
      return {updatedChart, message: Messages.CHART_UPDATE_SUCCESS};
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      console.log('Console.log Hello world: ', error);
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

      // Create a map of header ID to header name for quick lookup
      const headerMap = new Map<string, string>();
      headers.forEach((header) => {
        headerMap.set(header.id, header.name);
      });
      // Create enhanced config with resolved names
      const enhancedConfig = { ...config };

      // Replace xAxisKey UUID with header name
      if (config.config?.xAxisKey && headerMap.has(config.config.xAxisKey)) {
        enhancedConfig.config.xAxisKey = headerMap.get(config.config.xAxisKey);
      }

      // Replace yAxisKeys UUIDs with header names
      if (config.config?.yAxisKeys && Array.isArray(config.config.yAxisKeys)) {
        enhancedConfig.config.yAxisKeys = config.config.yAxisKeys.map((key) =>
          headerMap.has(key) ? headerMap.get(key) : key
        );
      }

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

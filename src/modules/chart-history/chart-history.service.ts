import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

import * as moment from "moment-timezone";
import { ChartHistoryResponseDto } from "./dto";

@Injectable()
export class ChartHistoryService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Tạo bản sao lưu của chart hiện tại vào lịch sử
   * Được gọi tự động trước khi update chart
   */
  async createHistorySnapshot(
    chartId: string,
    userId: string,
    changeNote?: string
  ): Promise<ChartHistoryResponseDto> {
    try {
      // Lấy thông tin chart hiện tại
      const currentChart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!currentChart) {
        throw new NotFoundException("Chart not found");
      }

      if (currentChart.userId !== userId) {
        throw new ForbiddenException("You do not have access to this chart");
      }

      // Tạo bản snapshot trong lịch sử
      const historyRecord = await this.prismaService.prisma.chartHistory.create({
        data: {
          chartId: currentChart.id,
          datasetId: currentChart.datasetId, // thêm datasetId
          name: currentChart.name,
          description: currentChart.description,
          type: currentChart.type,
          config: currentChart.config,
          updatedBy: userId,
          changeNote: changeNote,
        },
      });

      return historyRecord;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to create history snapshot: ${error.message}`
      );
    }
  }

  /**
   * Lấy tất cả lịch sử của một chart
   */
  async getChartHistory(
    chartId: string,
    userId: string
  ): Promise<ChartHistoryResponseDto[]> {
    try {
      // Kiểm tra quyền truy cập chart
      const chart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!chart) {
        throw new NotFoundException("Chart not found");
      }

      if (chart.userId !== userId) {
        throw new ForbiddenException("You do not have access to this chart");
      }

      const history = await this.prismaService.prisma.chartHistory.findMany({
        where: { chartId },
        orderBy: { createdAt: "desc" },
      });

      console.log("history: ", history);

      return history;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to fetch chart history: ${error.message}`
      );
    }
  }

  /**
   * Lấy một bản snapshot cụ thể từ lịch sử
   */
  async getHistoryById(
    historyId: string,
    userId: string
  ): Promise<ChartHistoryResponseDto> {
    try {
      const historyRecord =
        await this.prismaService.prisma.chartHistory.findUnique({
          where: { id: historyId },
          include: {
            chart: true,
          },
        });

      if (!historyRecord) {
        throw new NotFoundException("History record not found");
      }

      if (historyRecord.chart.userId !== userId) {
        throw new ForbiddenException(
          "You do not have access to this history record"
        );
      }

      return historyRecord;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to fetch history record: ${error.message}`
      );
    }
  }

  /**
   * Khôi phục chart về một phiên bản cũ từ lịch sử
   */
  async restoreFromHistory(
    chartId: string,
    historyId: string,
    userId: string,
    changeNote?: string
  ) {
    try {
      // Lấy bản snapshot từ lịch sử
      const historyRecord = await this.getHistoryById(historyId, userId);

      if (historyRecord.chartId !== chartId) {
        throw new BadRequestException(
          "History record does not belong to this chart"
        );
      }

      // Lưu trạng thái hiện tại vào lịch sử trước khi restore
      await this.createHistorySnapshot(chartId, userId, changeNote);

      // Khôi phục chart về config cũ
      const restoredChart = await this.prismaService.prisma.chart.update({
        where: { id: chartId },
        data: {
          name: historyRecord.name,
          description: historyRecord.description,
          type: historyRecord.type,
          config: historyRecord.config,
          datasetId: historyRecord.datasetId, // restore datasetId
        },
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

      return {
        message: "Chart restored successfully",
        chart: restoredChart,
        restoredFrom: historyRecord.createdAt,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to restore chart: ${error.message}`
      );
    }
  }

  /**
   * Xóa một bản ghi lịch sử
   */
  async deleteHistory(historyId: string, userId: string) {
    try {
      const historyRecord = await this.getHistoryById(historyId, userId);

      await this.prismaService.prisma.chartHistory.delete({
        where: { id: historyId },
      });

      return { message: "History record deleted successfully" };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to delete history record: ${error.message}`
      );
    }
  }
}

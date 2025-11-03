import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import * as moment from 'moment-timezone';
import { ChartHistoryResponseDto } from './dto';

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
    changeNote?: string,
  ): Promise<ChartHistoryResponseDto> {
    try {
      // Lấy thông tin chart hiện tại
      const currentChart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!currentChart) {
        throw new NotFoundException('Chart not found');
      }

      if (currentChart.userId !== userId) {
        throw new ForbiddenException('You do not have access to this chart');
      }

      const createdAt = currentChart.createdAt;

      // Tạo bản snapshot trong lịch sử
      const historyRecord = await this.prismaService.prisma.chartHistory.create(
        {
          data: {
            chartId: currentChart.id,
            name: currentChart.name,
            description: currentChart.description,
            type: currentChart.type,
            config: currentChart.config,
            updatedBy: userId,
            changeNote: changeNote,
          },
        },
      );

      return historyRecord;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to create history snapshot: ${error.message}`,
      );
    }
  }

  /**
   * Lấy tất cả lịch sử của một chart
   */
  async getChartHistory(
    chartId: string,
    userId: string,
  ): Promise<ChartHistoryResponseDto[]> {
    try {
      // Kiểm tra quyền truy cập chart
      const chart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!chart) {
        throw new NotFoundException('Chart not found');
      }

      if (chart.userId !== userId) {
        throw new ForbiddenException('You do not have access to this chart');
      }

      // Lấy 5 lịch sử mới nhất, sắp xếp theo thời gian mới nhất
      const history = await this.prismaService.prisma.chartHistory.findMany({
        where: { chartId },
        orderBy: { createdAt: 'desc' },
      });
      console.log('history: ', history);

      return history;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to fetch chart history: ${error.message}`,
      );
    }
  }

  /**
   * Lấy một bản snapshot cụ thể từ lịch sử
   */
  async getHistoryById(
    historyId: string,
    userId: string,
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
        throw new NotFoundException('History record not found');
      }

      if (historyRecord.chart.userId !== userId) {
        throw new ForbiddenException(
          'You do not have access to this history record',
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
        `Failed to fetch history record: ${error.message}`,
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
    changeNote?: string,
  ) {
    try {
      // Lấy bản snapshot từ lịch sử
      const historyRecord = await this.getHistoryById(historyId, userId);

      if (historyRecord.chartId !== chartId) {
        throw new BadRequestException(
          'History record does not belong to this chart',
        );
      }

      // Lưu trạng thái hiện tại vào lịch sử trước khi restore
      await this.createHistorySnapshot(
        chartId,
        userId,
        changeNote,
      );

      // Khôi phục chart về config cũ
      const restoredChart = await this.prismaService.prisma.chart.update({
        where: { id: chartId },
        data: {
          name: historyRecord.name,
          description: historyRecord.description,
          type: historyRecord.type,
          config: historyRecord.config,
        },
        include: {
          dataset: {
            include: {
              headers: {
                orderBy: { index: 'asc' },
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
        message: 'Chart restored successfully',
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
        `Failed to restore chart: ${error.message}`,
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

      return { message: 'History record deleted successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to delete history record: ${error.message}`,
      );
    }
  }

  /**
   * So sánh hai phiên bản (current vs history)
   */
  async compareVersions(chartId: string, historyId: string, userId: string) {
    try {
      // Lấy chart hiện tại
      const currentChart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!currentChart) {
        throw new NotFoundException('Chart not found');
      }

      if (currentChart.userId !== userId) {
        throw new ForbiddenException('You do not have access to this chart');
      }

      // Lấy bản snapshot từ lịch sử
      const historyRecord = await this.getHistoryById(historyId, userId);

      // So sánh các trường cơ bản
      const basicDifferences: any = {};
      
      if (currentChart.name !== historyRecord.name) {
        basicDifferences.name = {
          current: currentChart.name,
          historical: historyRecord.name,
        };
      }

      if (currentChart.description !== historyRecord.description) {
        basicDifferences.description = {
          current: currentChart.description,
          historical: historyRecord.description,
        };
      }

      if (currentChart.type !== historyRecord.type) {
        basicDifferences.type = {
          current: currentChart.type,
          historical: historyRecord.type,
        };
      }

      return {
        current: {
          name: currentChart.name,
          description: currentChart.description,
          type: currentChart.type,
          config: currentChart.config,
          updatedAt: currentChart.updatedAt,
        },
        historical: {
          name: historyRecord.name,
          description: historyRecord.description,
          type: historyRecord.type,
          config: historyRecord.config,
          createdAt: historyRecord.createdAt,
        },
        differences: {
          ...basicDifferences,
          config: this.calculateDifferences(
            currentChart.config as any,
            historyRecord.config as any,
          ),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to compare versions: ${error.message}`,
      );
    }
  }

  /**
   * Tính toán sự khác biệt giữa hai config
   */
  private calculateDifferences(current: any, historical: any): any {
    const differences: any = {};

    // So sánh các key trong config
    const allKeys = new Set([
      ...Object.keys(current?.config || {}),
      ...Object.keys(historical?.config || {}),
    ]);

    allKeys.forEach((key) => {
      const currentValue = current?.config?.[key];
      const historicalValue = historical?.config?.[key];

      if (JSON.stringify(currentValue) !== JSON.stringify(historicalValue)) {
        differences[key] = {
          current: currentValue,
          historical: historicalValue,
        };
      }
    });

    return differences;
  }

  /**
   * Lấy số lượng phiên bản lịch sử của một chart
   */
  async getHistoryCount(chartId: string, userId: string): Promise<number> {
    try {
      const chart = await this.prismaService.prisma.chart.findUnique({
        where: { id: chartId },
      });

      if (!chart) {
        throw new NotFoundException('Chart not found');
      }

      if (chart.userId !== userId) {
        throw new ForbiddenException('You do not have access to this chart');
      }

      const count = await this.prismaService.prisma.chartHistory.count({
        where: { chartId },
      });

      return count;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to count history records: ${error.message}`,
      );
    }
  }
}

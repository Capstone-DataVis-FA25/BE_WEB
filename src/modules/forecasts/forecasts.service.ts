import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateForecastDto } from './dto/create-forecast.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';

@Injectable()
export class ForecastsService {
  constructor(private readonly prismaService: PrismaService) { }

  async create(createForecastDto: CreateForecastDto, userId: string) {
    const {
      name,
      datasetId,
      targetColumn,
      featureColumns,
      forecastWindow,
      modelType,
      predictions,
      metrics,
    } = createForecastDto;

    // Verify dataset belongs to user if datasetId is provided
    if (datasetId) {
      const dataset = await this.prismaService.prisma.dataset.findUnique({
        where: { id: datasetId },
      });

      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      if (dataset.userId !== userId) {
        throw new ForbiddenException('You do not have access to this dataset');
      }
    }

    const forecastData = {
      datasetId: datasetId || null,
      name: name || null,
      targetColumn,
      featureColumns: featureColumns || [],
      forecastWindow,
      modelType,
      predictions: predictions as any,
      metrics: metrics ? (metrics as any) : null,
      analyze: null, // Will be populated later by AI analysis
      chartImageUrl: createForecastDto.chartImageUrl || null,
    };

    return await this.prismaService.prisma.forecast.create({
      data: forecastData,
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(userId: string) {
    return await this.prismaService.prisma.forecast.findMany({
      where: {
        dataset: {
          userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const forecast = await this.prismaService.prisma.forecast.findUnique({
      where: { id },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
    });

    if (!forecast) {
      throw new NotFoundException('Forecast not found');
    }

    // Check ownership through dataset
    if (!forecast.dataset) {
      throw new NotFoundException('Forecast dataset not found');
    }

    if (forecast.dataset.userId !== userId) {
      throw new ForbiddenException('You do not have access to this forecast');
    }

    // Ensure featureColumns is always an array (even if null in DB)
    return {
      ...forecast,
      featureColumns: forecast.featureColumns || [],
    };
  }

  async update(id: string, updateForecastDto: UpdateForecastDto, userId?: string) {
    // Verify ownership if userId is provided
    if (userId) {
      await this.findOne(id, userId);
    } else {
      // If no userId, just verify forecast exists
      const forecast = await this.prismaService.prisma.forecast.findUnique({
        where: { id },
      });
      if (!forecast) {
        throw new NotFoundException('Forecast not found');
      }
    }

    return await this.prismaService.prisma.forecast.update({
      where: { id },
      data: updateForecastDto,
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId?: string) {
    // Verify ownership if userId is provided (for user-initiated deletes)
    if (userId) {
      await this.findOne(id, userId);
    } else {
      // For internal rollback, just verify forecast exists
      const forecast = await this.prismaService.prisma.forecast.findUnique({
        where: { id },
      });
      if (!forecast) {
        throw new NotFoundException('Forecast not found');
      }
    }

    await this.prismaService.prisma.forecast.delete({
      where: { id },
    });

    return { message: 'Forecast deleted successfully' };
  }
}


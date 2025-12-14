import { Module, forwardRef } from '@nestjs/common';
import { ForecastsService } from './forecasts.service';
import { ForecastsController } from './forecasts.controller';
import { ForecastProcessingService } from './forecast-processing.service';
import { ForecastAnalysisJobService } from './forecast-analysis.job';
import { ForecastCreationJobService } from './forecast-creation.job';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiModule), // Use forwardRef to avoid circular dependency
    DatasetsModule,
    NotificationModule,
  ],
  controllers: [ForecastsController],
  providers: [ForecastsService, ForecastProcessingService, ForecastAnalysisJobService, ForecastCreationJobService],
  exports: [ForecastsService, ForecastProcessingService, ForecastCreationJobService],
})
export class ForecastsModule {}


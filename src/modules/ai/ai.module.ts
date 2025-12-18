import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiCleanJobService } from './ai.clean.job';
import { AiChartEvaluationService } from './ai.chart-evaluation.service';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { KmsModule } from '@modules/kms/kms.module';
import { DatasetsModule } from '@modules/datasets/datasets.module';
import { ForecastsModule } from '@modules/forecasts/forecasts.module';

@Module({
  imports: [
    NotificationModule,
    PrismaModule,
    KmsModule,
    forwardRef(() => ForecastsModule), // Use forwardRef to avoid circular dependency
    DatasetsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiCleanJobService, AiChartEvaluationService],
  exports: [AiService, AiChartEvaluationService],
})
export class AiModule {}

import { Module, forwardRef } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { ChartsController } from './charts.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DatasetsModule } from '@modules/datasets/datasets.module';
import { ChartHistoryModule } from '@modules/chart-history/chart-history.module';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';

@Module({
    imports: [PrismaModule, DatasetsModule, SubscriptionPlansModule, forwardRef(() => ChartHistoryModule)],
    controllers: [ChartsController],
    providers: [ChartsService],
    exports: [ChartsService],
})
export class ChartsModule { }
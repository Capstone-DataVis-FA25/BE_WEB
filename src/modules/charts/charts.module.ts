import { Module, forwardRef } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { ChartsController } from './charts.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DatasetsModule } from '@modules/datasets/datasets.module';
import { ChartHistoryModule } from '@modules/chart-history/chart-history.module';

@Module({
    imports: [PrismaModule, DatasetsModule, forwardRef(() => ChartHistoryModule)],
    controllers: [ChartsController],
    providers: [ChartsService],
    exports: [ChartsService],
})
export class ChartsModule { }
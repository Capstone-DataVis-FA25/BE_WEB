import { Module, forwardRef } from '@nestjs/common';
import { ChartHistoryService } from './chart-history.service';
import { ChartHistoryController } from './chart-history.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChartHistoryController],
  providers: [ChartHistoryService],
  exports: [ChartHistoryService],
})
export class ChartHistoryModule {}

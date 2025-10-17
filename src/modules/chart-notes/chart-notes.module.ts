import { Module } from '@nestjs/common';
import { ChartNotesService } from './chart-notes.service';
import { ChartNotesController } from './chart-notes.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChartNotesController],
  providers: [ChartNotesService],
  exports: [ChartNotesService],
})
export class ChartNotesModule {}

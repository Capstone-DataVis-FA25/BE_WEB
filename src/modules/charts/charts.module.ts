import { Module } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { ChartsController } from './charts.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DatasetsModule } from '@modules/datasets/datasets.module';

@Module({
    imports: [PrismaModule, DatasetsModule],
    controllers: [ChartsController],
    providers: [ChartsService],
    exports: [ChartsService],
})
export class ChartsModule { }
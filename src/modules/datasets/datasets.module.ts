import { Module } from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { DatasetsController } from './datasets.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [DatasetsController],
    providers: [DatasetsService],
    exports: [DatasetsService],
})
export class DatasetsModule { }

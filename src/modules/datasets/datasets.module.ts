import { Module } from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { DatasetsController } from './datasets.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';

@Module({
    imports: [PrismaModule, SubscriptionPlansModule],
    controllers: [DatasetsController],
    providers: [DatasetsService],
    exports: [DatasetsService],
})
export class DatasetsModule { }

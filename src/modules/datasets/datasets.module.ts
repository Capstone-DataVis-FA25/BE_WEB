import { Module } from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { DatasetsController } from './datasets.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionPlansModule } from '../subscription-plans/subscription-plans.module';
import { PerUserPayloadSizeInterceptor } from '../../interceptors/per-user-payload-size.interceptor';

@Module({
    imports: [PrismaModule, SubscriptionPlansModule],
    controllers: [DatasetsController],
    providers: [DatasetsService, PerUserPayloadSizeInterceptor],
    exports: [DatasetsService],
})
export class DatasetsModule { }

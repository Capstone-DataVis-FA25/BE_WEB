
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PayOSService } from './payos.service';

@Module({
    imports: [PrismaModule, ConfigModule],
    providers: [PaymentsService, PayOSService, ConfigService],
    controllers: [PaymentsController],
    exports: [PaymentsService, PayOSService],
})
export class PaymentsModule { }

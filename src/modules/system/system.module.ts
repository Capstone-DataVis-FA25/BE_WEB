import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SystemGateway } from './system.gateway';
import { SystemStatusUpdaterService } from './system-status-updater.service';

@Module({
    imports: [ConfigModule, PrismaModule],
    controllers: [SystemController],
    providers: [SystemService, SystemGateway, SystemStatusUpdaterService],
    exports: [SystemService, SystemGateway, SystemStatusUpdaterService],
})
export class SystemModule { }
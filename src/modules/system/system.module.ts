import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [ConfigModule, PrismaModule],
    controllers: [SystemController],
    providers: [SystemService],
    exports: [SystemService],
})
export class SystemModule { }
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiCleanerService } from './ai-cleaner.service';
import { AiCleanerController } from './ai-cleaner.controller';


@Module({
  imports: [ConfigModule],
  controllers: [AiCleanerController],
  providers: [AiCleanerService],
  exports: [AiCleanerService],
})
export class AiCleanerModule {}

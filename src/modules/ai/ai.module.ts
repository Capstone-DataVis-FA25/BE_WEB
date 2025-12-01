import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiCleanJobService } from './ai.clean.job';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [AiController],
  providers: [AiService, AiCleanJobService],
})
export class AiModule {}
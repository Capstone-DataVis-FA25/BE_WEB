import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ActivityService } from "./activity.service";
import { ActivityGateway } from "./activity.gateway";
import { ActivityConsumer } from "./activity.consumer";
import { PrismaModule } from "../../prisma/prisma.module";
import { ActivityController } from "./activity.controller";
import { ActivityCleanupService } from "./activity.cleanup.service";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityGateway,
    ActivityConsumer,
    ActivityCleanupService,
  ],
  exports: [ActivityService],
})
export class ActivityModule {}

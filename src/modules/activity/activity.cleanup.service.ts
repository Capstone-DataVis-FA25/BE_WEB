import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ActivityCleanupService {
  private readonly logger = new Logger(ActivityCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run every day at 02:30 AM server time
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeOldLogs(): Promise<void> {
    // 30 days ago
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    try {
      const del = await this.prisma.prisma.activityLog.deleteMany({
        where: {
          createdAt: { lt: threshold },
        },
      });
      this.logger.log(
        `Purged ${del.count} activity logs older than ${threshold.toISOString()}`
      );
    } catch (err) {
      this.logger.error("Failed to purge old activity logs", err);
    }
  }
}

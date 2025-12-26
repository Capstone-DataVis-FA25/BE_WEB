import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiRequestService } from './ai-request.service';

@Injectable()
export class AiRequestCronService {
    private readonly logger = new Logger(AiRequestCronService.name);

    constructor(private readonly aiRequestService: AiRequestService) { }

    /**
     * Reset all users' AI request counts daily at midnight (00:00)
     * This runs every day at 00:00:00
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
        name: 'reset-ai-request-counts',
        timeZone: 'Asia/Ho_Chi_Minh',
    })
    async handleDailyReset() {
        this.logger.log('Starting daily AI request count reset...');

        try {
            const resetCount = await this.aiRequestService.resetAllAiRequestCounts();
            this.logger.log(`Successfully reset AI request counts for ${resetCount} users`);
        } catch (error) {
            this.logger.error('Failed to reset AI request counts', error);
        }
    }

    /**
     * Optional: Log statistics every hour for monitoring
     */
    @Cron(CronExpression.EVERY_HOUR, {
        name: 'log-ai-request-stats',
    })
    async logStats() {
        // You can implement this to log statistics if needed
        this.logger.debug('AI request stats logged');
    }
}

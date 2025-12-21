import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from './users.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ResourceWarningCronService {
    private readonly logger = new Logger(ResourceWarningCronService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly emailService: EmailService,
    ) { }

    // Run every 3 days at 09:00 Asia/Ho_Chi_Minh
    @Cron('0 9 */3 * *', {
        name: 'resource-warning-every-3-days',
        timeZone: 'Asia/Ho_Chi_Minh',
    })
    async handleResourceWarnings() {
        this.logger.log('Checking users for resource warnings...');

        try {
            // Get all users (only regular users will be checked inside getResourceUsage call)
            const users = await this.usersService.findAll();

            for (const user of users) {
                try {
                    const usage = await this.usersService.getResourceUsage(user.id);

                    // Only send email if there are warnings
                    if (usage && Array.isArray(usage.warnings) && usage.warnings.length > 0) {
                        this.logger.log(`User ${user.email} has warnings: ${usage.warnings.join(', ')}`);

                        // Send an upgrade suggestion email
                        try {
                            await this.emailService.sendTemplateMail(
                                user.email,
                                'Nâng cấp gói để tiếp tục sử dụng dịch vụ',
                                'upgrade-subscription',
                                {
                                    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                                    warnings: usage.warnings,
                                    percentages: usage.percentage,
                                    subscriptionPlan: usage.subscriptionPlan,
                                    clientUrl: process.env.CLIENT_URL || '',
                                }
                            );
                            this.logger.log(`Upgrade email sent to ${user.email}`);
                        } catch (emailErr) {
                            this.logger.error(`Failed to send upgrade email to ${user.email}`, emailErr);
                        }
                    }
                } catch (err) {
                    this.logger.error(`Failed to process user ${user.email}`, err);
                }
            }
        } catch (err) {
            this.logger.error('Failed to check resource warnings', err);
        }
    }
}

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityModule } from '../activity/activity.module';
import { SubscriptionPlansModule } from '@modules/subscription-plans/subscription-plans.module';
import { ResourceWarningCronService } from './resource-warning-cron.service';
import { EmailModule } from '../email/email.module';

@Module({
	imports: [PrismaModule, ActivityModule, SubscriptionPlansModule, EmailModule],
	controllers: [UsersController],
	providers: [UsersService, ResourceWarningCronService],
	exports: [UsersService],
})
export class UsersModule { }
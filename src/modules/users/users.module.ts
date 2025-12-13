import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityModule } from '../activity/activity.module';
import { SubscriptionPlansModule } from '@modules/subscription-plans/subscription-plans.module';

@Module({
	imports: [PrismaModule, ActivityModule, SubscriptionPlansModule],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule { }
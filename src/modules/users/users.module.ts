import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedAuthModule } from '../shared/shared-auth.module';

@Module({
	imports: [PrismaModule, forwardRef(() => SharedAuthModule)],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}

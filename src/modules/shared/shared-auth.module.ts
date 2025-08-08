import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAccessTokenGuard } from '../auth/guards/jwt-access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAccessTokenStrategy } from '../auth/strategies/jwt-access-token.strategy';
import { UsersModule } from '../users/users.module';

@Module({
	imports: [
		PassportModule,
		JwtModule.register({}),
		forwardRef(() => UsersModule),
	],
	providers: [
		JwtAccessTokenGuard,
		RolesGuard,
		JwtAccessTokenStrategy,
	],
	exports: [
		JwtAccessTokenGuard,
		RolesGuard,
		JwtAccessTokenStrategy,
	],
})
export class SharedAuthModule {}

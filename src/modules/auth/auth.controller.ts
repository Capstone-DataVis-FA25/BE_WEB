import {
	Body,
	Controller,
	Post,
	HttpCode,
	HttpStatus,
	UseGuards,
	Req,
	Param,
	Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAccessTokenGuard } from './guards/jwt-access-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from 'src/decorators/auth.decorator';
import { UserRole } from '../users/dto/create-user.dto';
import { Request } from 'express';

interface AuthRequest extends Request {
	user: {
		sub: string;
		email: string;
		userId?: string;
		refreshToken?: string;
		role?: string;
		isActive?: boolean;
	};
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(private authService: AuthService) {}

	@Post('signup')
	@ApiOperation({ summary: 'User registration' })
	@ApiResponse({ status: 201, description: 'User registered successfully' })
	signUp(@Body() signUpDto: SignUpDto) {
		return this.authService.signUp(signUpDto);
	}

	@HttpCode(HttpStatus.OK)
	@Post('signin')
	@ApiOperation({ summary: 'User login' })
	@ApiResponse({ status: 200, description: 'User logged in successfully' })
	signIn(@Body() signInDto: SignInDto) {
		return this.authService.signIn(signInDto);
	}

	@Post('google')
	@ApiOperation({ summary: 'Google authentication' })
	@ApiResponse({ status: 200, description: 'Google authentication successful' })
	authenticateWithGoogle(@Body('googleToken') googleToken: string) {
		return this.authService.authenticateWithGoogle(googleToken);
	}

	@UseGuards(JwtRefreshGuard)
	@Post('refresh')
	@ApiOperation({ summary: 'Refresh access token' })
	@ApiResponse({ status: 200, description: 'Token refreshed successfully' })
	refreshTokens(@Req() req: AuthRequest, @Body('refreshToken') refreshToken: string) {
		const userId = req.user.userId || req.user.sub;
		const token = req.user.refreshToken || refreshToken;
		return this.authService.refreshTokens(userId, token);
	}

	@UseGuards(JwtAccessTokenGuard, RolesGuard)
	@Roles(UserRole.ADMIN)
	@Patch('unactive/:id')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Deactivate user account (Admin only)' })
	@ApiResponse({ status: 200, description: 'User deactivated successfully' })
	@ApiResponse({ status: 403, description: 'Insufficient permissions' })
	@ApiResponse({ status: 404, description: 'User not found' })
	async unActiveUser(@Param('id') id: string) {
		await this.authService.unActiveUser(id);
		return { message: 'User deactivated successfully' };
	}

	@UseGuards(JwtAccessTokenGuard)
	@Patch('unactive')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Deactivate own account' })
	@ApiResponse({ status: 200, description: 'Account deactivated successfully' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	@ApiResponse({ status: 404, description: 'User not found' })
	async unActiveSelf(@Req() req: AuthRequest) {
		await this.authService.unActiveUser(req.user.sub);
		return { message: 'Account deactivated successfully' };
	}

	@UseGuards(JwtAccessTokenGuard, RolesGuard)
	@Roles(UserRole.ADMIN)
	@Post('signout/:id')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Sign out user by admin' })
	@ApiResponse({ status: 200, description: 'User signed out successfully' })
	async signOutUser(@Param('id') id: string) {
		await this.authService.signOut(id);
		return { message: 'User signed out successfully' };
	}
}

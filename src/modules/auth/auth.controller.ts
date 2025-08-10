import {
	Body,
	Controller,
	Post,
	HttpCode,
	HttpStatus,
	UseGuards,
	Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { Request } from 'express';

export interface AuthRequest extends Request {
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


}

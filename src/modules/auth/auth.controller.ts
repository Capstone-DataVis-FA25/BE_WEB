import {
	Body,
	Controller,
	Post,
	Get,
	HttpCode,
	HttpStatus,
	UseGuards,
	Req,
	Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtRefreshTokenGuard } from './guards/jwt-refresh-token.guard';
import { GoogleAuthGuard } from './guards/google.guard';
import { ConfigService } from '@nestjs/config';

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
	constructor(
		private authService: AuthService,
		private configService: ConfigService,
	) { }

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

	@Get('google')
	@UseGuards(GoogleAuthGuard)
	@ApiOperation({ summary: 'Initiate Google OAuth2 authentication' })
	@ApiResponse({ status: 200, description: 'Redirects to Google OAuth2' })
	async googleAuth() {
		// This will redirect to Google OAuth2
	}

	@Get('google/callback')
	@UseGuards(GoogleAuthGuard)
	@ApiOperation({ summary: 'Google OAuth2 callback' })
	@ApiResponse({ status: 200, description: 'Google authentication successful' })
	async googleAuthCallback(@Req() req: any, @Res() res: Response) {
		const { user } = req;
		const result = await this.authService.authenticateWithGoogleUser(user);

		// Redirect to frontend with tokens
		const redirectUrl = `${this.configService.get('FRONTEND_URL')}/auth/callback?access_token=${result.tokens.access_token}&refresh_token=${result.tokens.refresh_token}`;
		res.redirect(redirectUrl);
	}

	@Post('google/token')
	@ApiOperation({ summary: 'Google authentication with ID token' })
	@ApiResponse({ status: 200, description: 'Google authentication successful' })
	authenticateWithGoogleToken(@Body('idToken') idToken: string) {
		return this.authService.authenticateWithGoogle(idToken);
	}

	@UseGuards(JwtRefreshTokenGuard)
	@Post('refresh')
	@ApiOperation({ summary: 'Refresh access token' })
	@ApiResponse({ status: 200, description: 'Token refreshed successfully' })
	refreshTokens(@Req() req: AuthRequest, @Body('refreshToken') refreshToken: string) {
		const userId = req.user.userId || req.user.sub;
		const token = req.user.refreshToken || refreshToken;
		return this.authService.refreshTokens(userId, token);
	}


}
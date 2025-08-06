import { 
	Body, 
	Controller, 
	Post, 
	UseGuards, 
	Request,
	Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtRefreshTokenGuard } from './guards/jwt-refresh-token.guard';
import { JwtAccessTokenGuard } from './guards/jwt-access-token.guard';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiBody,
} from '@nestjs/swagger';

export class GoogleAuthDto {
	googleToken: string;
}

export class RefreshTokenDto {
	refreshToken: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('signup')
	@ApiOperation({ summary: 'Register a new user' })
	@ApiResponse({ status: 201, description: 'User created successfully' })
	@ApiResponse({ status: 409, description: 'User already exists' })
	async signUp(@Body() signUpDto: SignUpDto) {
		return this.authService.signUp(signUpDto);
	}

	@Post('signin')
	@ApiOperation({ summary: 'Sign in with email and password' })
	@ApiResponse({ status: 200, description: 'User signed in successfully' })
	@ApiResponse({ status: 401, description: 'Invalid credentials' })
	async signIn(@Body() signInDto: SignInDto) {
		return this.authService.signIn(signInDto);
	}

	@Post('google')
	@ApiOperation({ summary: 'Authenticate with Google' })
	@ApiBody({ 
		schema: { 
			type: 'object', 
			properties: { 
				googleToken: { type: 'string' } 
			} 
		} 
	})
	@ApiResponse({ status: 200, description: 'Google authentication successful' })
	@ApiResponse({ status: 400, description: 'Invalid Google token' })
	async googleAuth(@Body() { googleToken }: GoogleAuthDto) {
		return this.authService.authenticateWithGoogle(googleToken);
	}

	@Post('refresh')
	@UseGuards(JwtRefreshTokenGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Refresh access token' })
	@ApiResponse({ status: 200, description: 'Token refreshed successfully' })
	@ApiResponse({ status: 401, description: 'Invalid refresh token' })
	async refresh(@Request() req: any) {
		const userId = req.user.sub;
		const refreshToken = req.user.refreshToken;
		return this.authService.refreshTokens(userId, refreshToken);
	}

	@Post('signout')
	@UseGuards(JwtAccessTokenGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Sign out user' })
	@ApiResponse({ status: 200, description: 'User signed out successfully' })
	async signOut(@Request() req: any) {
		await this.authService.signOut(req.user.sub);
		return { message: 'Signed out successfully' };
	}

	@Get('profile')
	@UseGuards(JwtAccessTokenGuard)
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Get current user profile' })
	@ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
	async getProfile(@Request() req: any) {
		return req.user;
	}
}

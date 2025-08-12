import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
	BadRequestException,
	ConflictException,
	Injectable,
	UnauthorizedException,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { User } from '../../types/user.types';
import { UserRole } from '../users/dto/create-user.dto';
import { TokenPayload } from './interfaces/token.interface';
import {
	access_token_private_key,
	access_token_public_key,
	refresh_token_private_key,
} from 'src/constraints/jwt.constraint';
import { EmailService } from '@modules/email/email.service';
import { GoogleAuthService } from './google-auth.service';

export interface GoogleUser {
	email: string;
	firstName?: string;
	lastName?: string;
	picture?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly googleAuthService: GoogleAuthService
  ) {}


	async signUp(signUpDto: SignUpDto): Promise<{ user: Partial<User>; tokens: any }> {
		// Check if user exists
		const existingUser = await this.usersService.findByEmail(signUpDto.email);
		if (existingUser) {
			throw new ConflictException('User with this email already exists');
		}

		// Create user
		const user = await this.usersService.create({
			...signUpDto,
			role: UserRole.USER,
		});

		// Generate tokens
		const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);

		// Save refresh token
		await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

		// Remove password from response
		const { password, ...userResponse } = user;

		return { user: userResponse, tokens };
	}

	async signIn(signInDto: SignInDto): Promise<{ user: Partial<User>; tokens: any }> {
		const user = await this.validateUser(signInDto.email, signInDto.password);
		if (!user) {
			throw new UnauthorizedException('Invalid credentials');
		}

		if (!user.isActive) {
			throw new UnauthorizedException('Account is deactivated');
		}

		const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);
		await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

		// Remove password from response
		const { password, ...userResponse } = user;

		return { user: userResponse, tokens };
	}

	async authenticateWithGoogle(
    googleToken: string
  ): Promise<{ user: Partial<User>; tokens: any }> {
    try {
      // Verify Google token with Google's servers
      const googlePayload =
        await this.googleAuthService.verifyGoogleToken(googleToken);

      // Find or create user
      const user =
        await this.googleAuthService.findOrCreateGoogleUser(googlePayload);

      if (!user.isActive) {
        throw new HttpException(
          { message: "Account is deactivated", error: "Unauthorized" },
          HttpStatus.UNAUTHORIZED
        );
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);
      await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

      // Remove password from response
      const { password, ...userResponse } = user;

      return { user: userResponse, tokens };
    } catch (error) {
      throw new BadRequestException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message,
        message:
          "Có lỗi xảy ra với Google authentication, vui lòng thử lại sau",
      });
    }
  }

  async authenticateWithGoogleUser(
    googleUser: any
  ): Promise<{ user: Partial<User>; tokens: any }> {
    try {
      // Find or create user
      const user =
        await this.googleAuthService.findOrCreateGoogleUser(googleUser);

      if (!user.isActive) {
        throw new HttpException(
          { message: "Account is deactivated", error: "Unauthorized" },
          HttpStatus.UNAUTHORIZED
        );
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);
      await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

      // Remove password from response
      const { password, ...userResponse } = user;

      return { user: userResponse, tokens };
    } catch (error) {
      throw new BadRequestException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: error.message,
        message:
          "Có lỗi xảy ra với Google authentication, vui lòng thử lại sau",
      });
    }
  }

	async validateUser(email: string, password: string): Promise<User | null> {
		const user = await this.usersService.findByEmail(email);
		if (user && await bcrypt.compare(password, user.password)) {
			return user;
		}
		return null;
	}

	async refreshTokens(userId: string, refreshToken: string): Promise<any> {
		const user = await this.usersService.getUserIfRefreshTokenMatches(refreshToken, userId);
		if (!user) {
			throw new UnauthorizedException('Invalid refresh token');
		}

		const tokens = await this.generateTokens(user.id, user.email, user.role as UserRole);
		await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

		return tokens;
	}

	async verifyEmail(token: string): Promise<any> {
    try {
      console.log("Verifying token:", token.substring(0, 50) + "...");
      console.log(
        "Using public key:",
        access_token_public_key.substring(0, 100) + "..."
      );

      const payload = this.jwtService.verify(token, {
        publicKey: access_token_public_key, 
        algorithms: ["RS256"],
      });

      console.log("Token payload:", payload);

      const userId = payload.sub;
      const user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        throw new BadRequestException("User not found");
      }
      if (user.isVerified) {
        return { message: "Email đã được xác thực trước đó." };
      }
      // Cập nhật trạng thái xác thực
      await this.usersService.update(userId, { isVerified: true });
      return { message: "Xác thực email thành công." };
    } catch (error) {
      console.error("Token verification error:", error);
      throw new BadRequestException(
        "Token xác thực không hợp lệ hoặc đã hết hạn"
      );
    }
  }

	async signOut(userId: string): Promise<void> {
		await this.usersService.removeRefreshToken(userId);
	}

	private async generateTokens(userId: string, email: string, role: UserRole): Promise<any> {
		const payload: TokenPayload = { sub: userId, email, role };

		const accessToken = this.jwtService.sign(payload, {
			secret: access_token_private_key,
			expiresIn: `${this.configService.get('jwt.access_token_expiration_time')}s`,
		});

		const refreshToken = this.jwtService.sign(payload, {
			secret: refresh_token_private_key,
			expiresIn: `${this.configService.get('jwt.refresh_token_expiration_time')}s`,
		});

		return {
			access_token: accessToken,
			refresh_token: refreshToken,
		};
	}
}

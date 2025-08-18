import * as bcrypt from "bcryptjs";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { SignUpDto } from "./dto/sign-up.dto";
import { SignInDto } from "./dto/sign-in.dto";
import { User } from "../../types/user.types";
import { UserRole } from "../users/dto/create-user.dto";
import { TokenPayload } from "./interfaces/token.interface";
import {
  access_token_private_key,
  access_token_public_key,
  refresh_token_private_key,
} from "src/constraints/jwt.constraint";
import * as fs from "fs";
import { EmailService } from "../email/email.service";
import { GoogleAuthService } from "./google-auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

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
  ) { }

  async signUp(signUpDto: SignUpDto): Promise<{
    user: Partial<User>;
    tokens: any;
    message: string;
    verifyToken?: string;
  }> {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(signUpDto.email);
    if (existingUser) {
      throw new ConflictException("User with this email already exists");
    }

    // Create user
    const user = await this.usersService.create({
      ...signUpDto,
      role: UserRole.USER,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Generate verify token using dedicated method
    const verifyToken = await this.generateVerifyToken(user.id, user.email);

    // Send verify email
    await this.emailService.sendEmailVerification(user.email, verifyToken);

    // Save refresh token
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    // Remove password from response
    const { password, ...userResponse } = user;

    return {
      user: userResponse,
      tokens,
      verifyToken: verifyToken,
      message: "Email verification send success! Check mail",
    };
  }

  async signIn(
    signInDto: SignInDto
  ): Promise<{ user: Partial<User>; tokens: any }> {
    const user = await this.validateUser(signInDto.email, signInDto.password);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }
    if (!user.isVerified) {
      throw new UnauthorizedException(
        "Account is not verify ! Please check mail"
      );
    }

    const tokens = await this.generateTokens(user.id, user.email);
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

      const tokens = await this.generateTokens(user.id, user.email);
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

      const tokens = await this.generateTokens(user.id, user.email);
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
    if (user && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<any> {
    const user = await this.usersService.getUserIfRefreshTokenMatches(
      refreshToken,
      userId
    );
    if (!user) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  async verifyEmail(token: string): Promise<any> {
    try {
      // console.log(
      //   "Using public key:",
      //   access_token_public_key.substring(0, 100) + "..."
      // );

      // Giải mã token với RSA public key
      const payload = this.jwtService.verify(token, {
        publicKey: access_token_public_key,
        algorithms: ["RS256"],
      });

      const user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        throw new BadRequestException("User not found");
      }
      if (user.isVerified) {
        return { message: "Email đã được xác thực trước đó." };
      }
      await this.usersService.update(user.id, { isVerified: true });
      return { message: "Xác thực email thành công." };
    } catch (error) {
      throw new BadRequestException(
        "Token xác thực không hợp lệ hoặc đã hết hạn"
      );
    }
  }

  async signOut(userId: string): Promise<void> {
    await this.usersService.removeRefreshToken(userId);
  }

  private async generateTokens(userId: string, email: string): Promise<any> {
    const payload: TokenPayload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      privateKey: access_token_private_key,
      expiresIn: `${this.configService.get("JWT_ACCESS_TOKEN_EXPIRATION_TIME")}s`,
      algorithm: "RS256",
    });

    const refreshToken = this.jwtService.sign(payload, {
      privateKey: refresh_token_private_key,
      expiresIn: `${this.configService.get("JWT_REFRESH_TOKEN_EXPIRATION_TIME")}s`,
      algorithm: "RS256",
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async generateVerifyToken(
    userId: string,
    email: string
  ): Promise<any> {
    const payload: TokenPayload = { sub: userId, email };

    const verifyToken = this.jwtService.sign(payload, {
      privateKey: access_token_private_key,
      expiresIn: "30m",
      algorithm: "RS256",
    });

    return verifyToken;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new Error("Email doesn't exist");
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      {
        privateKey: access_token_private_key,
        expiresIn: "30m",
        algorithm: "RS256",
      }
    );

    await this.emailService.sendResetPasswordEmail(user.email, resetToken);

    return {
      message: "Email reset password has been sent",
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify(token, {
        secret: access_token_private_key,
      });
    } catch (error) {
      throw new UnauthorizedException("Token is invalid or has expired");
    }

    const user = await this.usersService.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException("User doesn't exist");
    }

    // Cập nhật password
    await this.usersService.update(user.id, {
      password: newPassword,
    });

    return {
      message: "Password has been reset successfully",
    };
  }
}

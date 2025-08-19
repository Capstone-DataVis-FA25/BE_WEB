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
import e from "express";
import { use } from "passport";
import {
  EMAIL_ALREADY_VERIFY,
  EMAIL_VERIFY_SUCCESS,
  USER_ALREADY_EXIST,
  USER_NOT_FOUND,
  VERIFY_TOKEN_EXPIRED,
} from "src/constant/message-exception-config";

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

  async signUp(signUpDto: SignUpDto): Promise<{
    user: Partial<User>;
    tokens: any;
    message: string;
    verifyToken?: string;
  }> {
    const existingUser = await this.usersService.findByEmail(signUpDto.email);

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new UnauthorizedException(USER_ALREADY_EXIST);
      } else {
        // Xóa currentVerifyToken cũ
        await this.usersService.update(existingUser.id, {
          currentVerifyToken: null,
        });

        // Tạo verifyToken mới
        const verifyToken = await this.generateVerifyToken(
          existingUser.id,
          existingUser.email
        );

        // Gán lại currentVerifyToken
        await this.usersService.update(existingUser.id, {
          currentVerifyToken: verifyToken,
        });

        // Gửi lại email xác thực
        await this.emailService.sendEmailVerification(
          existingUser.email,
          verifyToken
        );

        return {
          user: { ...existingUser, password: undefined },
          tokens: null,
          verifyToken,
          message: "Email verification re-send success! Check mail",
        };
      }
    }

    // Tạo user mới
    const user = await this.usersService.create({
      ...signUpDto,
      role: UserRole.USER,
      isVerified: false,
    });

    // Tạo verifyToken mới
    const verifyToken = await this.generateVerifyToken(user.id, user.email);

    // Gán currentVerifyToken
    await this.usersService.update(user.id, {
      currentVerifyToken: verifyToken,
    });

    // Gửi email xác thực
    await this.emailService.sendEmailVerification(user.email, verifyToken);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Save refresh token
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    const { password, ...userResponse } = user;

    const updatedUser = await this.usersService.findOne(user.id);

    return {
      user: userResponse,
      tokens,
      verifyToken,
      message: "Email verification send success! Check mail",
    };
  }

  async resendVerifyEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: "User not found" };
    }
    if (user.isVerified == true) {
      return { message: "User have already verified!" };
    }
    // Nếu chưa verify, gửi lại email xác thực
    // Xóa currentVerifyToken nếu có
    await this.usersService.update(user.id, { currentVerifyToken: null });

    // Tạo mới và update mới
    const verifyToken = await this.generateVerifyToken(user.id, user.email);

    await this.usersService.update(user.id, {
      currentVerifyToken: verifyToken,
    });

    await this.emailService.sendEmailVerification(user.email, verifyToken);
    return { message: "Email verification re-send success! Check mail" };
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

      // Update is verified attribute via UsersService helper
      await this.usersService.markVerified(user.id);

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
      // Giải mã token với RSA public key
      const payload = this.jwtService.verify(token, {
        publicKey: access_token_public_key,
        algorithms: ["RS256"],
      });

      const user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        throw new BadRequestException(USER_NOT_FOUND);
      }

      // Nếu user đã verify = true -> xóa currentVerifyToken -> trả về message
      if (user.isVerified == true) {
        await this.usersService.update(user.id, { currentVerifyToken: null });
        return { message: "Email đã được xác thực trước đó." };
      }

      // Giải token xem còn hạn không ?
      await this.usersService.verifyByToken(user.id, token);

      return { message: "Xác thực email thành công." };
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new BadRequestException("Token đã hết hạn");
      }
      if (error.name === "JsonWebTokenError") {
        throw new BadRequestException("Token không hợp lệ");
      }
      if (error.message === "Token invalid or already used") {
        throw new BadRequestException(
          "Token không hợp lệ hoặc đã được sử dụng"
        );
      }
      throw new BadRequestException(VERIFY_TOKEN_EXPIRED);
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
      throw new Error("Token is invalid or has expired");
    }

    const user = await this.usersService.findByEmail(payload.email);
    if (!user) {
      throw new Error("User doesn't exist");
    }

    // Cập nhật password - hash bên trong hàm update
    await this.usersService.update(user.id, {
      password: newPassword,
    });

    return {
      message: "Password has been reset successfully",
    };
  }
}

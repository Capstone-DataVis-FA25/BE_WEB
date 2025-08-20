import * as bcrypt from "bcryptjs";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
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
import { EmailService } from "../email/email.service";
import { GoogleAuthService } from "./google-auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { message } from "src/constant/message-exception-config";

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
        throw new UnauthorizedException(message.USER_ALREADY_EXIST);
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
          message: message.EMAIL_VERIFICATION_RESEND_SUCCESS,
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
      message: message.EMAIL_VERIFICATION_SEND_SUCCESS,
    };
  }

  async resendVerifyEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: message.USER_NOT_FOUND };
    }
    if (user.isVerified == true) {
      return { message: message.EMAIL_ALREADY_VERIFY };
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
    return { message: message.EMAIL_VERIFICATION_RESEND_SUCCESS };
  }

  async signIn(
    signInDto: SignInDto
  ): Promise<{ user: Partial<User>; tokens: any }> {
    const user = await this.validateUser(signInDto.email, signInDto.password);
    if (!user) {
      throw new UnauthorizedException(message.USER_UNAUTHORIZATION);
    }

    if (!user.isActive) {
      throw new UnauthorizedException(message.USER_IN_ACTIVE);
    }
    if (!user.isVerified) {
      throw new UnauthorizedException(message.USER_NOT_VERIFIED);
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
          {
            message: message.USER_IN_ACTIVE,
            error: message.USER_UNAUTHORIZATION,
          },
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
          {
            message: message.USER_IN_ACTIVE,
            error: message.USER_UNAUTHORIZATION,
          },
          HttpStatus.UNAUTHORIZED
        );
      }

      const tokens = await this.generateTokens(user.id, user.email);
      await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

      // Remove password from response
      const { password, ...userResponse } = user;

      // Update is verified attribute via UsersService helper
      await this.usersService.update(user.id, { currentVerifyToken: null });

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
      throw new UnauthorizedException(message.TOKEN_INVALID);
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
        throw new BadRequestException(message.USER_NOT_FOUND);
      }

      // Nếu user đã verify = true -> xóa currentVerifyToken -> trả về message
      if (user.isVerified == true) {
        await this.usersService.update(user.id, { currentVerifyToken: null });
        return { message: message.EMAIL_ALREADY_VERIFIED };
      }

      // Giải token xem còn hạn không ?
      await this.usersService.verifyByToken(user.id, token);

      return { message: message.EMAIL_VERIFICATION_SUCCESS };
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new BadRequestException(message.TOKEN_EXPIRED);
      }
      if (error.name === "JsonWebTokenError") {
        throw new BadRequestException(message.TOKEN_INVALID);
      }
      if (error.message === "Token invalid or already used") {
        throw new BadRequestException(message.TOKEN_ALREADY_USED);
      }
      throw new BadRequestException(message.VERIFY_TOKEN_EXPIRED);
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
      throw new NotFoundException(message.USER_NOT_FOUND);
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
      message: message.PASSWORD_RESET_EMAIL_SENT,
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
      throw new NotFoundException(message.USER_NOT_FOUND);
    }

    // Cập nhật password
    await this.usersService.update(user.id, {
      password: newPassword,
    });

    return {
      message: message.PASSWORD_RESET_SUCCESS,
    };
  }
}

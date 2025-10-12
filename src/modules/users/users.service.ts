import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UserRole } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User, UserWithoutPassword } from "../../types/user.types";
import * as bcrypt from "bcryptjs";
import { ChangePasswordDTO } from "./dto/change-password.dto";
import { Messages } from "src/constant/message-config";

@Injectable()
export class UsersService {
  constructor(private prismaService: PrismaService) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Hash password only if provided (for Google OAuth users, password might be undefined)
    const hashedPassword = createUserDto.password
      ? await bcrypt.hash(createUserDto.password, 10)
      : null;

    const user = await this.prismaService.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        role: createUserDto.role || UserRole.USER,
      },
    });

    return user as User;
  }

  async findAll(): Promise<UserWithoutPassword[]> {
    const users = await this.prismaService.prisma.user.findMany({
            omit: {
        password: true,
        currentHashedRefreshToken: true,
        currentVerifyToken: true,
            }
    });

    return users as UserWithoutPassword[];
  }

  async findOne(id: string): Promise<UserWithoutPassword | null> {
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id },
           omit: {
        password: true,
        currentHashedRefreshToken: true,
        currentVerifyToken: true,
            }
    });
    return user as UserWithoutPassword | null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prismaService.prisma.user.findUnique({
      where: { email },
    });

    return user as User | null;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const updateData: any = { ...updateUserDto };

    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const user = await this.prismaService.prisma.user.update({
      where: { id },
      data: updateData,
    });

    return user as User;
  }

  async remove(id: string, email?: string): Promise<void> {
    if (!email) {
      throw new BadRequestException(Messages.USER_NOT_FOUND);
    }
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(Messages.USER_NOT_FOUND);
    }
    if (user.email !== email) {
      throw new UnauthorizedException(Messages.USER_UNAUTHORIZATION);
    }
    await this.prismaService.prisma.user.delete({
      where: { id },
    });
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prismaService.prisma.user.update({
      where: { id: userId },
      data: {
        currentHashedRefreshToken: hashedRefreshToken,
      },
    });
  }

  async getUserIfRefreshTokenMatches(
    refreshToken: string,
    userId: string
  ): Promise<User | null> {
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.currentHashedRefreshToken) {
      return null;
    }

    const isRefreshTokenMatching = await bcrypt.compare(
      refreshToken,
      user.currentHashedRefreshToken
    );

    if (isRefreshTokenMatching) {
      return user as User;
    }

    return null;
  }

  async removeRefreshToken(userId: string): Promise<void> {
    await this.prismaService.prisma.user.update({
      where: { id: userId },
      data: {
        currentHashedRefreshToken: null,
      },
    });
  }

  async verifyByToken(userId: string, token: string): Promise<User> {
    // Lấy user để kiểm tra chi tiết
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException(Messages.USER_NOT_FOUND);
    }

    // Kiểm tra từng điều kiện một cách rõ ràng
    if (user.isVerified) {
      throw new BadRequestException(Messages.EMAIL_ALREADY_VERIFY);
    }

    if (user.currentVerifyToken !== token) {
      throw new BadRequestException(Messages.VERIFY_TOKEN_EXPIRED);
    }

    // Token hợp lệ, tiến hành verify
    const updated = await this.update(userId, {
      isVerified: true,
      currentVerifyToken: null,
    } as any);

    return updated as User;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDTO
  ): Promise<{ message: string }> {
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(Messages.USER_NOT_FOUND);
    }

    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException(Messages.USER_UNAUTHORIZATION);
    }

    const isOldPasswordValid = await bcrypt.compare(
      dto.old_password,
      user.password
    );
    if (!isOldPasswordValid) {
      throw new UnauthorizedException(Messages.USER_UNAUTHORIZATION);
    }

    const hashedNewPassword = await bcrypt.hash(dto.new_password, 10);

    await this.prismaService.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return {
      message: Messages.PASSWORD_RESET_SUCCESS,
    };
  }

  // Update user profile
  async updateProfile(
    userId: string,
    updateUserdto: UpdateUserDto
  ): Promise<{ user: Partial<User> }> {
    // Update user profile
    const updatedUser = await this.prismaService.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: updateUserdto.firstName,
        lastName: updateUserdto.lastName,
      },
    });

    return { user: updatedUser };
  }
}

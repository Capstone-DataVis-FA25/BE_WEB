import { ActivityService } from './../activity/activity.service';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UserRole } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User, UserWithoutPassword } from "../../types/user.types";
import * as bcrypt from "bcryptjs";
import { ChangePasswordDTO } from "./dto/change-password.dto";
import { Messages } from "src/constant/message-config";
import { AppConstants } from "src/constant/app.constants";
import { SubscriptionPlansService } from '@modules/subscription-plans/subscription-plans.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prismaService: PrismaService, private activityService: ActivityService, private subscriptionPlansService: SubscriptionPlansService) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Hash password only if provided (for Google OAuth users, password might be undefined)
    const hashedPassword = createUserDto.password
      ? await bcrypt.hash(createUserDto.password, 10)
      : null;

    const defaultPlanId = await this.subscriptionPlansService.getDefaultSubscriptionPlanId();

    const data = {
      ...createUserDto,
      password: hashedPassword ?? undefined,
      role: createUserDto.role || UserRole.USER,
    };

    if (!data.subscriptionPlanId && defaultPlanId) {
      data.subscriptionPlanId = defaultPlanId;
    }

    const user = await this.prismaService.prisma.user.create({
      data,
    });

    return user as User;
  }

  async findAll(): Promise<UserWithoutPassword[]> {
    const users = await this.prismaService.prisma.user.findMany({
      omit: {
        password: true,
        currentHashedRefreshToken: true,
        currentVerifyToken: true,
      },
      include: {
        subscriptionPlan: true,
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
      },
      include: {
        subscriptionPlan: true,
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

  // Get user resource usage
  async getResourceUsage(userId: string) {
    // Get user with subscription plan
    const user = await this.prismaService.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptionPlan: true,
      },
    });

    if (!user) {
      throw new NotFoundException(Messages.USER_NOT_FOUND);
    }

    // Count datasets and charts directly from their tables
    const [datasetsCount, chartsCount] = await Promise.all([
      this.prismaService.prisma.dataset.count({ where: { userId } }),
      this.prismaService.prisma.chart.count({ where: { userId } }),
    ]);

    // Get AI requests count directly from User model
    const aiRequestsCount = user.aiRequestsCount;

    // Get limits from subscription plan
    const limits = user.subscriptionPlan?.limits as any || {};
    const maxDatasets = limits?.maxDatasets || null;
    const maxCharts = limits?.maxCharts || null;
    const maxAiRequests = limits?.maxAiRequests || null;

    // Calculate percentages
    const datasetsPercentage = maxDatasets ? Math.round((datasetsCount / maxDatasets) * 100) : 0;
    const chartsPercentage = maxCharts ? Math.round((chartsCount / maxCharts) * 100) : 0;
    const aiRequestsPercentage = maxAiRequests ? Math.round((aiRequestsCount / maxAiRequests) * 100) : 0;

    // Check if nearing limits (>80%)
    const warnings: string[] = [];
    if (datasetsPercentage >= 80) warnings.push('datasets');
    if (chartsPercentage >= 80) warnings.push('charts');
    if (aiRequestsPercentage >= 80) warnings.push('aiRequests');

    return {
      usage: {
        datasetsCount,
        chartsCount,
        aiRequestsCount,
      },
      limits: {
        maxDatasets,
        maxCharts,
        maxAiRequests,
      },
      percentage: {
        datasets: datasetsPercentage,
        charts: chartsPercentage,
        aiRequests: aiRequestsPercentage,
      },
      warnings,
      subscriptionPlan: user.subscriptionPlan ? {
        id: user.subscriptionPlan.id,
        name: user.subscriptionPlan.name,
      } : null,
    };
  }

  // Lock or unlock a user (admin functionality)
  async lockUnlockUser(
    userId: string,
    isActive: boolean
  ): Promise<UserWithoutPassword> {
    try {
      const user = await this.prismaService.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: isActive,
        },
        omit: {
          password: true,
          currentHashedRefreshToken: true,
          currentVerifyToken: true,
        }
      });

      // Create activity log
      try {
        await this.activityService.createLog({
          actorId: userId,
          actorType: "USER",
          action: isActive ? "LOCK_USER" : "UNLOCK_USER",
          resource: "USER",
          metadata: { userId, isActive },
        });
      } catch (activityError) {
        this.logger.error('Failed to create activity log:', activityError);
        // Don't throw here as the main operation (lock/unlock) should still succeed
      }

      return user as UserWithoutPassword;
    } catch (error) {
      this.logger.error('Failed to lock/unlock user:', error);
      throw error;
    }
  }

  // Get resource usage statistics over time for all users (Admin only)
  async getResourceUsageOverTime(period: 'day' | 'week' | 'month' | 'year' = 'week') {
    const now = new Date();
    let startDate: Date;
    let groupByFormat: string;
    let intervals: { date: string; label: string }[] = [];

    // Calculate date range and intervals based on period
    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%d %H:00';
        // Last 24 hours
        for (let i = 23; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 60 * 60 * 1000);
          intervals.push({
            date: date.toISOString(),
            label: `${date.getHours()}:00`,
          });
        }
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%d';
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          intervals.push({
            date: date.toISOString().split('T')[0],
            label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          });
        }
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%d';
        // Last 30 days (group by week)
        for (let i = 4; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          intervals.push({
            date: date.toISOString().split('T')[0],
            label: `Week ${5 - i}`,
          });
        }
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m';
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now);
          date.setMonth(date.getMonth() - i);
          intervals.push({
            date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          });
        }
        break;
    }

    // Get all users with their resource counts
    const users = await this.prismaService.prisma.user.findMany({
      where: {
        role: UserRole.USER,
      },
      include: {
        datasets: {
          where: {
            createdAt: {
              gte: startDate,
            },
          },
          select: {
            id: true,
            createdAt: true,
          },
        },
        charts: {
          where: {
            createdAt: {
              gte: startDate,
            },
          },
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      omit: {
        password: true,
        currentHashedRefreshToken: true,
        currentVerifyToken: true,
      },
    });

    // Calculate top users by resource count
    const userStats = users.map(user => ({
      userId: user.id,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      email: user.email,
      datasetsCount: user.datasets.length,
      chartsCount: user.charts.length,
      totalResources: user.datasets.length + user.charts.length,
    })).sort((a, b) => b.totalResources - a.totalResources);

    const topUsers = userStats.slice(0, 10);

    // Aggregate data for time series
    const timeSeriesData = intervals.map(interval => {
      let datasetsCount = 0;
      let chartsCount = 0;

      users.forEach(user => {
        const intervalStart = new Date(interval.date);
        let intervalEnd: Date;

        if (period === 'day') {
          intervalEnd = new Date(intervalStart.getTime() + 60 * 60 * 1000);
        } else if (period === 'week' || period === 'month') {
          intervalEnd = new Date(intervalStart.getTime() + 24 * 60 * 60 * 1000);
        } else {
          intervalEnd = new Date(intervalStart);
          intervalEnd.setMonth(intervalEnd.getMonth() + 1);
        }

        user.datasets.forEach(dataset => {
          const createdAt = new Date(dataset.createdAt);
          if (createdAt >= intervalStart && createdAt < intervalEnd) {
            datasetsCount++;
          }
        });

        user.charts.forEach(chart => {
          const createdAt = new Date(chart.createdAt);
          if (createdAt >= intervalStart && createdAt < intervalEnd) {
            chartsCount++;
          }
        });
      });

      return {
        period: interval.label,
        date: interval.date,
        datasetsCount,
        chartsCount,
        totalResources: datasetsCount + chartsCount,
      };
    });

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      topUsers,
      timeSeriesData,
      summary: {
        totalDatasets: users.reduce((sum, u) => sum + u.datasets.length, 0),
        totalCharts: users.reduce((sum, u) => sum + u.charts.length, 0),
        totalUsers: users.length,
      },
    };
  }
}

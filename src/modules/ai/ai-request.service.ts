import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiRequestService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Check if user has exceeded their AI request limit based on subscription plan
     * @param userId User ID to check
     * @throws HttpException if limit exceeded
     */
    async checkAiRequestLimit(userId: string): Promise<void> {
        const user = await this.prisma.prisma.user.findUnique({
            where: { id: userId },
            include: {
                subscriptionPlan: true,
            },
        });

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // If user has no subscription plan, use default limits
        let maxAiRequests = 10; // Default free tier limit

        if (user.subscriptionPlan) {
            // Extract AI request limit from subscription plan limits JSON
            const limits = user.subscriptionPlan.limits as any;
            if (limits && typeof limits === 'object' && limits.maxAiRequests) {
                maxAiRequests = limits.maxAiRequests;
            }
        }

        // Check if user has exceeded limit
        if (user.aiRequestsCount >= maxAiRequests) {
            throw new HttpException(
                {
                    message: `You have reached your daily AI request limit (${maxAiRequests} requests). Please upgrade your plan or wait until tomorrow.`,
                    currentCount: user.aiRequestsCount,
                    maxLimit: maxAiRequests,
                    code: 'AI_LIMIT_EXCEEDED',
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    /**
     * Increment user's AI request count
     * @param userId User ID
     * @returns Updated count
     */
    async incrementAiRequestCount(userId: string): Promise<number> {
        const updated = await this.prisma.prisma.user.update({
            where: { id: userId },
            data: {
                aiRequestsCount: {
                    increment: 1,
                },
            },
            select: {
                aiRequestsCount: true,
            },
        });

        return updated.aiRequestsCount;
    }

    /**
     * Reset all users' AI request counts to 0
     * This should be called by a cron job daily
     */
    async resetAllAiRequestCounts(): Promise<number> {
        const result = await this.prisma.prisma.user.updateMany({
            where: {
                aiRequestsCount: {
                    gt: 0,
                },
            },
            data: {
                aiRequestsCount: 0,
            },
        });

        return result.count;
    }

    /**
     * Get user's current AI request count and limit
     * @param userId User ID
     * @returns Object with current count and max limit
     */
    async getAiRequestStatus(userId: string): Promise<{
        currentCount: number;
        maxLimit: number;
        remaining: number;
    }> {
        const user = await this.prisma.prisma.user.findUnique({
            where: { id: userId },
            include: {
                subscriptionPlan: true,
            },
        });

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        let maxAiRequests = 10; // Default free tier limit

        if (user.subscriptionPlan) {
            const limits = user.subscriptionPlan.limits as any;
            if (limits && typeof limits === 'object' && limits.maxAiRequests) {
                maxAiRequests = limits.maxAiRequests;
            }
        }

        return {
            currentCount: user.aiRequestsCount,
            maxLimit: maxAiRequests,
            remaining: Math.max(0, maxAiRequests - user.aiRequestsCount),
        };
    }
}

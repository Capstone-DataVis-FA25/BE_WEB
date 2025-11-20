import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSubscriptionPlanDto } from "./dto/create-subscription-plan.dto";
import { UpdateSubscriptionPlanDto } from "./dto/update-subscription-plan.dto";
import { Messages } from "src/constant/message-config";

@Injectable()
export class SubscriptionPlansService {
    constructor(private readonly prismaService: PrismaService) { }

    async create(createSubscriptionPlanDto: CreateSubscriptionPlanDto) {
        try {
            // Check if a plan with the same name already exists
            const existingPlan = await this.prismaService.prisma.subscriptionPlan.findFirst({
                where: { name: createSubscriptionPlanDto.name }
            });

            if (existingPlan) {
                throw new BadRequestException("A plan with this name already exists");
            }

            const plan = await this.prismaService.prisma.subscriptionPlan.create({
                data: {
                    ...createSubscriptionPlanDto,
                    currency: createSubscriptionPlanDto.currency || "USD",
                    interval: createSubscriptionPlanDto.interval || "month",
                    isActive: createSubscriptionPlanDto.isActive ?? true,
                },
            });

            return {
                plan,
                message: Messages.SUBSCRIPTION_PLAN_CREATE_SUCCESS,
            };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to create subscription plan: ${error.message}`
            );
        }
    }

    async findAll() {
        try {
            const plans = await this.prismaService.prisma.subscriptionPlan.findMany({
                orderBy: { createdAt: "asc" },
            });
            return plans;
        } catch (error) {
            throw new BadRequestException(
                `Failed to fetch subscription plans: ${error.message}`
            );
        }
    }

    async findOne(id: string) {
        try {
            const plan = await this.prismaService.prisma.subscriptionPlan.findUnique({
                where: { id },
            });

            if (!plan) {
                throw new NotFoundException("Subscription plan not found");
            }

            return plan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to fetch subscription plan: ${error.message}`
            );
        }
    }

    async update(id: string, updateSubscriptionPlanDto: UpdateSubscriptionPlanDto) {
        try {
            // Check if plan exists
            const existingPlan = await this.findOne(id);

            // If name is being updated, check if another plan already has that name
            if (updateSubscriptionPlanDto.name && updateSubscriptionPlanDto.name !== existingPlan.name) {
                const duplicatePlan = await this.prismaService.prisma.subscriptionPlan.findFirst({
                    where: {
                        name: updateSubscriptionPlanDto.name,
                        NOT: { id }
                    }
                });

                if (duplicatePlan) {
                    throw new BadRequestException("A plan with this name already exists");
                }
            }

            const updatedPlan = await this.prismaService.prisma.subscriptionPlan.update({
                where: { id },
                data: updateSubscriptionPlanDto,
            });

            return {
                plan: updatedPlan,
                message: Messages.SUBSCRIPTION_PLAN_UPDATE_SUCCESS,
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to update subscription plan: ${error.message}`
            );
        }
    }

    async remove(id: string) {
        try {
            // Check if plan exists
            const plan = await this.findOne(id);

            // Check if plan is active (prevent deletion of active plans)
            if (plan.isActive) {
                throw new BadRequestException("Cannot delete an active plan. Deactivate it first.");
            }

            // Check if plan is being used (this would require checking user subscriptions in a full implementation)
            // For now, we'll just add a placeholder comment for future implementation
            // In a complete implementation, you would check if any users are subscribed to this plan

            await this.prismaService.prisma.subscriptionPlan.delete({
                where: { id },
            });

            return { message: Messages.SUBSCRIPTION_PLAN_DELETE_SUCCESS };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to delete subscription plan: ${error.message}`
            );
        }
    }

    // Public method to get only active plans (for users to view)
    async findActivePlans() {
        try {
            const plans = await this.prismaService.prisma.subscriptionPlan.findMany({
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
            });
            return plans;
        } catch (error) {
            throw new BadRequestException(
                `Failed to fetch active subscription plans: ${error.message}`
            );
        }
    }

    // Helper method to check if user can create more datasets
    async canCreateDataset(userId: string): Promise<{ allowed: boolean; message?: string }> {
        try {
            // Get user with their subscription plan
            const user = await this.prismaService.prisma.user.findUnique({
                where: { id: userId },
                include: {
                    subscriptionPlan: true,
                    datasets: true,
                },
            });

            if (!user) {
                throw new NotFoundException("User not found");
            }

            // If user has no subscription plan, they can't create datasets
            if (!user.subscriptionPlan) {
                return {
                    allowed: false,
                    message: Messages.NO_SUBSCRIPTION_PLAN,
                };
            }

            // Check if plan has limits
            const limits = user.subscriptionPlan.limits as any;
            if (!limits || typeof limits.maxDatasets !== 'number') {
                // No limit set, allow unlimited
                return { allowed: true };
            }

            // Check current count against limit
            const currentCount = user.datasets.length;
            if (currentCount >= limits.maxDatasets) {
                return {
                    allowed: false,
                    message: Messages.DATASET_LIMIT_EXCEEDED,
                };
            }

            return { allowed: true };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to check dataset limit: ${error.message}`
            );
        }
    }

    // Helper method to check if user can create more charts
    async canCreateChart(userId: string): Promise<{ allowed: boolean; message?: string }> {
        try {
            // Get user with their subscription plan
            const user = await this.prismaService.prisma.user.findUnique({
                where: { id: userId },
                include: {
                    subscriptionPlan: true,
                    charts: true,
                },
            });

            if (!user) {
                throw new NotFoundException("User not found");
            }

            // If user has no subscription plan, they can't create charts
            if (!user.subscriptionPlan) {
                return {
                    allowed: false,
                    message: Messages.NO_SUBSCRIPTION_PLAN,
                };
            }

            // Check if plan has limits
            const limits = user.subscriptionPlan.limits as any;
            if (!limits || typeof limits.maxCharts !== 'number') {
                // No limit set, allow unlimited
                return { allowed: true };
            }

            // Check current count against limit
            const currentCount = user.charts.length;
            if (currentCount >= limits.maxCharts) {
                return {
                    allowed: false,
                    message: Messages.CHART_LIMIT_EXCEEDED,
                };
            }

            return { allowed: true };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(
                `Failed to check chart limit: ${error.message}`
            );
        }
    }
}
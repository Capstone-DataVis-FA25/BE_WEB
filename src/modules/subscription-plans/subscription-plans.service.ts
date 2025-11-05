import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { CreateCheckoutDto } from './dto/create-checkout.dto';
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
                    sortOrder: createSubscriptionPlanDto.sortOrder ?? 0,
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
                orderBy: { sortOrder: "asc" },
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
                orderBy: { sortOrder: "asc" },
            });
            return plans;
        } catch (error) {
            throw new BadRequestException(
                `Failed to fetch active subscription plans: ${error.message}`
            );
        }
    }

    /**
     * Create a checkout session using PayOS (or other provider configured via env).
     * Accepts a priceId which may be a provider-specific price id (eg. stripe price id)
     * or an internal subscription plan id. Returns { checkoutUrl } if available.
     */
    async createCheckout(createCheckoutDto: CreateCheckoutDto) {
        const { priceId, returnUrl } = createCheckoutDto;

        // Resolve plan by stripePriceId or by id
        let plan = null;
        if (!priceId) {
            throw new BadRequestException('priceId is required');
        }

        // Try to find plan by stripePriceId first
        plan = await this.prismaService.prisma.subscriptionPlan.findFirst({
            where: { stripePriceId: priceId },
        });

        // If not found, try by internal id
        if (!plan) {
            plan = await this.prismaService.prisma.subscriptionPlan.findUnique({
                where: { id: priceId },
            });
        }

        if (!plan) {
            throw new NotFoundException('Subscription plan not found for provided priceId');
        }

        // Build PayOS request payload. The exact fields depend on PayOS API; keep this generic
        const payosBase = process.env.PAYOS_API_BASE || process.env.PAYOS_BASE_URL;
        const payosKey = process.env.PAYOS_API_KEY;

        if (!payosBase || !payosKey) {
            // Not configured; return a helpful error so deployer can set env vars
            throw new BadRequestException('Payment gateway is not configured on server (missing PAYOS_API_BASE or PAYOS_API_KEY)');
        }

        const payload = {
            amount: Math.round((plan.price || 0) * 100), // cents/lowest currency unit
            currency: plan.currency || 'USD',
            description: plan.description || plan.name,
            // Use provider price id if available so provider can create right product/price
            priceId: plan.stripePriceId || plan.id,
            metadata: {
                planId: plan.id,
                planName: plan.name,
            },
            // return url for success/cancel (frontend should handle)
            returnUrl: returnUrl || process.env.PAYOS_RETURN_URL || '',
        };

        try {
            // This is a generic POST to PayOS service - adapt path to actual PayOS API
            // const resp = await axios.post(`${payosBase}/v1/checkout-sessions`, payload, {
            //     headers: {
            //         Authorization: `Bearer ${payosKey}`,
            //         'Content-Type': 'application/json',
            //     },
            //     timeout: 15000,
            // });

            // Expect provider to return an URL to redirect user to checkout
            const data = resp.data || {};
            const checkoutUrl = data.checkoutUrl || data.url || data.sessionUrl || data.redirectUrl;

            return { checkoutUrl };
        } catch (error) {
            // Bubble up useful message
            const message = error?.response?.data || error.message || 'Failed to create checkout session';
            throw new BadRequestException(`Payment provider error: ${JSON.stringify(message)}`);
        }
    }
}
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayOSService } from './payos.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);
    constructor(
        private readonly prismaService: PrismaService,
        private readonly payosService: PayOSService,
        private readonly configService: ConfigService,
    ) { }

    async createCheckout(userId: string, planId: string, returnUrl?: string) {
        const plan = await this.prismaService.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) {
            throw new NotFoundException('Subscription plan not found');
        }

        const user = await this.prismaService.prisma.user.findUnique({ where: { id: userId } });

        if (user.subscriptionPlanId) {
            const currentPlan = await this.prismaService.prisma.subscriptionPlan.findUnique({ where: { id: user.subscriptionPlanId } });
            if (currentPlan && currentPlan.price >= plan.price) {
                throw new BadRequestException('Cannot downgrade or subscribe to a cheaper plan');
            }
            await this.prismaService.prisma.user.update({
                where: { id: userId },
                data: { subscriptionPlanId: null },
            });
        }

        if (user.subscriptionPlanId === planId) {
            throw new BadRequestException('User already subscribed to this plan');
        }

        if (!plan.isActive) {
            throw new BadRequestException('Subscription plan is not active');
        }

        // Create a PENDING transaction in DB
        const orderCode = Date.now() + parseInt(uuidv4().slice(-5), 16);
        const tx = await this.prismaService.prisma.paymentTransaction.create({
            data: {
                userId: userId || undefined,
                subscriptionPlanId: planId,
                amount: plan.price,
                currency: plan.currency || 'USD',
                provider: 'payos',
                providerTransactionId: orderCode.toString(),
                metadata: { returnUrl: returnUrl || null },
            },
        });

        // Create PayOS payment link
        // Use providerTxId as orderCode (PayOS requires a number, so we can use a timestamp or hash, here we use Date.now())
        const cancelUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
        const payosCheckoutUrl = await this.payosService.createPaymentLink({
            orderCode,
            amount: plan.price,
            description: `Thanh toán gói ${plan.name}`,
            cancelUrl,
            returnUrl: returnUrl || cancelUrl,
        });

        // Ensure metadata is an object before spreading to avoid TS error when metadata can be non-object (e.g. null)
        await this.prismaService.prisma.paymentTransaction.update({
            where: { id: tx.id },
            data: {
                metadata: {
                    ...((tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)) ? tx.metadata as Record<string, any> : {}),
                    orderCode,
                },
            },
        });

        this.logger.debug(`Created PayOS payment tx ${tx.id} for plan ${planId}`);

        return {
            checkoutUrl: payosCheckoutUrl,
            transactionId: tx.id,
        };
    }

    async getTransaction(id: string) {
        const tx = await this.prismaService.prisma.paymentTransaction.findUnique({ where: { id } });
        if (!tx) throw new NotFoundException('Payment transaction not found');
        return tx;
    }

    async handleProviderWebhook(providerTransactionId: string, status: string, metadata?: any) {
        // Find transaction
        const tx = await this.prismaService.prisma.paymentTransaction.findFirst({ where: { providerTransactionId } });
        if (!tx) {
            this.logger.warn(`Webhook for unknown providerTransactionId=${providerTransactionId}`);
            throw new NotFoundException('Payment transaction not found');
        }

        // Map provider status to our enum names — expect provider sends matching names
        const normalizedStatus = (status || '').toUpperCase();
        if (!['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(normalizedStatus)) {
            throw new BadRequestException('Unknown payment status');
        }

        // Update transaction
        await this.prismaService.prisma.paymentTransaction.update({
            where: { id: tx.id },
            data: {
                status: normalizedStatus as any,
                metadata: Object.assign(
                    {},
                    (typeof tx.metadata === 'object' && tx.metadata !== null) ? tx.metadata : {},
                    (typeof metadata === 'object' && metadata !== null) ? metadata : {},
                ),
            },
        });

        // If completed, assign subscription to user
        if (normalizedStatus === 'COMPLETED' && tx.userId && tx.subscriptionPlanId) {
            await this.prismaService.prisma.user.update({
                where: { id: tx.userId },
                data: { subscriptionPlanId: tx.subscriptionPlanId },
            });
        }

        return { ok: true };
    }

    // Get total revenue (all time, only COMPLETED)
    async getTotalRevenue() {
        const result = await this.prismaService.prisma.paymentTransaction.aggregate({
            _sum: { amount: true },
            where: { status: 'COMPLETED' },
        });
        return { totalRevenue: result._sum.amount || 0 };
    }

    // Get revenue for each day in the last 30 days (only COMPLETED)
    async getRevenueLast30Days() {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Lấy tất cả transaction COMPLETED trong 30 ngày gần nhất
        const txs = await this.prismaService.prisma.paymentTransaction.findMany({
            where: {
                status: 'COMPLETED',
                createdAt: { gte: thirtyDaysAgo },
            },
            select: {
                amount: true,
                createdAt: true,
            },
        });
        // Gom nhóm theo ngày (YYYY-MM-DD)
        const dailyMap: Record<string, number> = {};
        for (let i = 0; i < 30; i++) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().slice(0, 10);
            dailyMap[key] = 0;
        }
        for (const tx of txs) {
            const key = tx.createdAt.toISOString().slice(0, 10);
            if (dailyMap[key] !== undefined) {
                dailyMap[key] += tx.amount;
            }
        }
        // Trả về mảng [{date, revenue}] theo thứ tự ngày tăng dần
        const result = Object.entries(dailyMap)
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return { revenueLast30Days: result };
    }

    // List payment transactions (with pagination, filter by status only)
    async listTransactions({ page = 1, limit = 20, status }: { page?: number; limit?: number; status?: string }) {
        const where: any = {};
        if (status) where.status = status;
        const [items, total] = await Promise.all([
            this.prismaService.prisma.paymentTransaction.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prismaService.prisma.paymentTransaction.count({ where }),
        ]);
        return {
            data: items,
            page,
            limit,
            total,
        };
    }

    // Get user-specific payment transactions
    async getUserTransactions(userId: string, { page = 1, limit = 10 }: { page?: number; limit?: number }) {
        const where = { userId };
        const [items, total] = await Promise.all([
            this.prismaService.prisma.paymentTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    subscriptionPlan: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                            currency: true,
                        },
                    },
                },
            }),
            this.prismaService.prisma.paymentTransaction.count({ where }),
        ]);
        return {
            data: items,
            page,
            limit,
            total,
        };
    }

    // Get payment transaction detail by id
    async getTransactionDetail(id: string) {
        const tx = await this.prismaService.prisma.paymentTransaction.findUnique({ where: { id } });
        if (!tx) throw new NotFoundException('Payment transaction not found');
        return tx;
    }
}

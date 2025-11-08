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
}

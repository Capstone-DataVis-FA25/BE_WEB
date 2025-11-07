import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);
    constructor(private readonly prismaService: PrismaService) { }

    async createCheckout(userId: string, planId: string, returnUrl?: string) {
        const plan = await this.prismaService.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) {
            throw new NotFoundException('Subscription plan not found');
        }

        // Create a PENDING transaction in DB
        const providerTxId = uuidv4();
        const tx = await this.prismaService.prisma.paymentTransaction.create({
            data: {
                userId: userId || undefined,
                subscriptionPlanId: planId,
                amount: plan.price,
                currency: plan.currency || 'USD',
                provider: process.env.PAYMENT_PROVIDER || 'payos',
                providerTransactionId: providerTxId,
                metadata: { returnUrl: returnUrl || null },
            },
        });

        // TODO: Replace this stub with a real PayOS API call to create a checkout/session
        // For now return a checkout URL that includes the providerTransactionId so front-end can redirect.
        const checkoutUrlBase = process.env.PAYOS_CHECKOUT_URL || 'https://payos.example/checkout';
        const checkoutUrl = `${checkoutUrlBase}?tx=${encodeURIComponent(providerTxId)}&amount=${encodeURIComponent(String(plan.price))}`;

        this.logger.debug(`Created pending payment tx ${tx.id} for plan ${planId}`);

        return {
            checkoutUrl,
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
                metadata: { ...(tx.metadata || {}), ...(metadata || {}) },
            },
        });

        // If completed, assign subscription to user
        if (normalizedStatus === 'COMPLETED' && tx.userId && tx.subscriptionPlanId) {
            // Note: This sets the user's `subscriptionPlanId` to the new plan.
            // For a complete system you may want to create a Subscription table with start/end dates.
            await this.prismaService.prisma.user.update({
                where: { id: tx.userId },
                data: { subscriptionPlanId: tx.subscriptionPlanId },
            });
        }

        return { ok: true };
    }
}

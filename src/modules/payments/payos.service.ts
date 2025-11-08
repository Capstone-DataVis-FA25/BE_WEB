import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';

@Injectable()
export class PayOSService implements OnModuleInit {
    private payos: PayOS;

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        const clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
        const apiKey = this.configService.get<string>('PAYOS_API_KEY');
        const checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');

        if (!clientId || !apiKey || !checksumKey) {
            throw new Error('PayOS configuration is not complete.');
        }

        this.payos = new PayOS({
            clientId,
            apiKey,
            checksumKey,
        });
    }

    async createPaymentLink(data: {
        orderCode: number;
        amount: number;
        description: string;
        cancelUrl: string;
        returnUrl: string;
    }) {
        const paymentLink = await this.payos.paymentRequests.create({
            orderCode: data.orderCode,
            amount: data.amount,
            description: data.description,
            cancelUrl: data.cancelUrl,
            returnUrl: data.returnUrl,
        });

        return paymentLink.checkoutUrl;
    }

    verifyWebhook(body: any) {
        return this.payos.webhooks.verify(body);
    }
}

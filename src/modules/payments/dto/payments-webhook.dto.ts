import { IsNotEmpty, IsString } from 'class-validator';

// Minimal webhook DTO — adapt to PayOS's actual webhook payload
export class PaymentsWebhookDto {
    @IsNotEmpty()
    @IsString()
    providerTransactionId: string;

    @IsNotEmpty()
    @IsString()
    status: string; // e.g. COMPLETED, FAILED, REFUNDED

    // Optional metadata from provider
    metadata?: any;
}

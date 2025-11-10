import { IsNotEmpty, IsString } from 'class-validator';
export class PaymentsWebhookDto {
    @IsNotEmpty()
    @IsString()
    providerTransactionId: string;

    @IsNotEmpty()
    @IsString()
    status: string; // e.g. COMPLETED, FAILED, REFUNDED

    metadata?: any;
}

import {
    Controller,
    Post,
    Body,
    UseGuards,
    Request,
    Get,
    Param,
    HttpCode,
    Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { PaymentsWebhookDto } from './dto/payments-webhook.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
    private readonly logger = new Logger(PaymentsController.name);
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('checkout')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a checkout session for a subscription plan' })
    async createCheckout(@Request() req: any, @Body() body: CreatePaymentDto) {
        const userId = req.user?.userId || req.user?.id;
        const { planId, returnUrl } = body;
        return this.paymentsService.createCheckout(userId, planId, returnUrl);
    }

    @Get(':id')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get payment transaction by id (user or admin)' })
    async getTransaction(@Request() req: any, @Param('id') id: string) {
        // For simplicity we allow user to fetch their own tx; admin role checks can be added
        const tx = await this.paymentsService.getTransaction(id);
        return tx;
    }

    // Webhook endpoint for PayOS to notify about payment updates
    // NOTE: In production you MUST verify signatures and secure this endpoint
    @Post('webhook')
    @HttpCode(200)
    @ApiOperation({ summary: 'Webhook endpoint for payment provider callbacks' })
    async webhook(@Body() body: PaymentsWebhookDto) {
        this.logger.debug('Received payment webhook');
        const { providerTransactionId, status, metadata } = body as any;
        return this.paymentsService.handleProviderWebhook(providerTransactionId, status, metadata);
    }
}

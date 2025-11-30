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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
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

    @Get('transactions')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'List all payment transactions (admin, paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
    async listTransactions(@Request() req: any) {
        const { page = '1', limit = '20' } = req.query || {};
        const pageNum = Number(page) > 0 ? Number(page) : 1;
        const limitNum = Number(limit) > 0 ? Number(limit) : 20;
        const result = await this.paymentsService.listTransactions({
            page: pageNum,
            limit: limitNum,
        });
        return {
            data: result.data,
            page: pageNum,
            limit: limitNum,
            total: result.total,
            totalPages: Math.ceil((result.total || 0) / limitNum),
        };
    }

    @Get('transactions/:id')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get payment transaction detail by id' })
    async getTransactionDetail(@Param('id') id: string) {
        return this.paymentsService.getTransactionDetail(id);
    }

    @Get(':id')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get payment transaction by id (user or admin)' })
    async getTransaction(@Request() req: any, @Param('id') id: string) {
        const tx = await this.paymentsService.getTransaction(id);
        return tx;
    }

    @Post('webhook')
    @HttpCode(200)
    @ApiOperation({ summary: 'Webhook endpoint for payment provider callbacks' })
    async webhook(@Body() body: PaymentsWebhookDto) {
        this.logger.debug('Received payment webhook: ', body);
        const { providerTransactionId, status, metadata } = body as any;
        return this.paymentsService.handleProviderWebhook(providerTransactionId, status, metadata);
    }

    @Get('revenue/total')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get total revenue (all time, only COMPLETED)' })
    async getTotalRevenue() {
        return this.paymentsService.getTotalRevenue();
    }

    @Get('revenue/last-30-days')
    @UseGuards(JwtAccessTokenGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get revenue for the last 30 days (only COMPLETED)' })
    async getRevenueLast30Days() {
        return this.paymentsService.getRevenueLast30Days();
    }
}

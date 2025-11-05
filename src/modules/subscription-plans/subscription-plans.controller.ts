import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Request,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiBody,
} from '@nestjs/swagger';
import { SubscriptionPlansService } from './subscription-plans.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';
import { Roles } from 'src/decorators/roles.decorator';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { UserRole } from '@modules/users/dto/create-user.dto';

@ApiTags('subscription-plans')
@Controller('subscription-plans')
@ApiBearerAuth()
export class SubscriptionPlansController {
    constructor(private readonly subscriptionPlansService: SubscriptionPlansService) { }

    @Post()
    @UseGuards(JwtAccessTokenGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Create a new subscription plan (Admin only)',
        description: 'Create a new subscription plan with configurable attributes. Only accessible by admin users.',
    })
    @ApiResponse({ status: 201, description: 'Subscription plan created successfully' })
    @ApiBody({ type: CreateSubscriptionPlanDto })
    create(@Body() createSubscriptionPlanDto: CreateSubscriptionPlanDto) {
        return this.subscriptionPlansService.create(createSubscriptionPlanDto);
    }

    @Get()
    @UseGuards(JwtAccessTokenGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Get all subscription plans (Admin only)',
        description: 'Retrieve all subscription plans (active and inactive). Only accessible by admin users.',
    })
    @ApiResponse({ status: 200, description: 'List of subscription plans retrieved successfully' })
    findAll() {
        return this.subscriptionPlansService.findAll();
    }

    @Get('active')
    @ApiOperation({
        summary: 'Get all active subscription plans',
        description: 'Retrieve all active subscription plans for users to view available options.',
    })
    @ApiResponse({ status: 200, description: 'List of active subscription plans retrieved successfully' })
    findActivePlans() {
        return this.subscriptionPlansService.findActivePlans();
    }

    @Get(':id')
    @UseGuards(JwtAccessTokenGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Get subscription plan by ID (Admin only)',
        description: 'Retrieve a specific subscription plan by its ID. Only accessible by admin users.',
    })
    @ApiResponse({ status: 200, description: 'Subscription plan retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Subscription plan not found' })
    @ApiParam({ name: 'id', description: 'ID of the subscription plan to retrieve' })
    findOne(@Param('id') id: string) {
        return this.subscriptionPlansService.findOne(id);
    }

    @Patch(':id')
    @UseGuards(JwtAccessTokenGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Update a subscription plan (Admin only)',
        description: 'Update a subscription plan by its ID. Only accessible by admin users.',
    })
    @ApiResponse({ status: 200, description: 'Subscription plan updated successfully' })
    @ApiResponse({ status: 404, description: 'Subscription plan not found' })
    @ApiParam({ name: 'id', description: 'ID of the subscription plan to update' })
    @ApiBody({ type: UpdateSubscriptionPlanDto })
    update(
        @Param('id') id: string,
        @Body() updateSubscriptionPlanDto: UpdateSubscriptionPlanDto,
    ) {
        return this.subscriptionPlansService.update(id, updateSubscriptionPlanDto);
    }

    @Delete(':id')
    @UseGuards(JwtAccessTokenGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiOperation({
        summary: 'Delete a subscription plan (Admin only)',
        description: 'Delete a subscription plan by its ID. Only accessible by admin users.',
    })
    @ApiResponse({ status: 200, description: 'Subscription plan deleted successfully' })
    @ApiResponse({ status: 404, description: 'Subscription plan not found' })
    @ApiParam({ name: 'id', description: 'ID of the subscription plan to delete' })
    remove(@Param('id') id: string) {
        return this.subscriptionPlansService.remove(id);
    }

    // Public endpoint to create a checkout session (frontend opens returned URL)
    @Post('checkout')
    @ApiOperation({
        summary: 'Create checkout session for a subscription plan',
        description: 'Creates a checkout session for the provided priceId or plan id and returns a redirect URL',
    })
    @ApiResponse({ status: 200, description: 'Checkout session created successfully' })
    async createCheckout(@Body() body: any) {
        // Use DTO validation by importing and typing if desired
        return this.subscriptionPlansService.createCheckout(body);
    }
}
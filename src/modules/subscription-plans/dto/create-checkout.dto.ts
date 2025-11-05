import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateCheckoutDto {
    @ApiProperty({ description: 'Price ID or subscription plan ID', example: 'price_12345' })
    @IsString()
    @IsNotEmpty()
    priceId: string;

    @ApiProperty({ description: 'Optional return URL after payment', required: false })
    @IsOptional()
    @IsString()
    returnUrl?: string;
}

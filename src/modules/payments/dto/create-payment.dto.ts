import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentDto {
    @IsNotEmpty()
    @IsString()
    planId: string;

    @IsOptional()
    @IsString()
    returnUrl?: string; // where PayOS should redirect after payment
}

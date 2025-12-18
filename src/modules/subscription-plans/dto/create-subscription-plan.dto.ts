import { ApiProperty } from "@nestjs/swagger";
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsPositive,
    IsOptional,
    IsBoolean,
    IsArray,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PlanLimitsDto {
    @ApiProperty({ required: false, description: "Maximum number of datasets allowed" })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    maxDatasets?: number;

    @ApiProperty({ required: false, description: "Maximum number of charts allowed" })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    maxCharts?: number;

    @ApiProperty({ required: false, description: "Maximum file upload size in MB" })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    maxFileSize?: number;

    @ApiProperty({ required: false, description: "AI request limit per month" })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    maxAiRequests?: number;
}

export class CreateSubscriptionPlanDto {
    @ApiProperty({ example: "Pro Plan" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: "Our premium plan with advanced features", required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 29.99 })
    @IsNumber()
    price: number;

    @ApiProperty({ example: "USD", required: false })
    @IsOptional()
    @IsString()
    currency?: string;

    @ApiProperty({ example: "month", required: false })
    @IsOptional()
    @IsString()
    interval?: string;

    @ApiProperty({ example: ["Unlimited charts", "Priority support", "Advanced analytics"], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    features?: string[];

    @ApiProperty({ required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlanLimitsDto)
    limits?: PlanLimitsDto;

    @ApiProperty({ example: true, required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
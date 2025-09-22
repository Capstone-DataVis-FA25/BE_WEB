import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional, MaxLength } from 'class-validator';

export class CreateChartDto {
    @ApiProperty({
        description: 'Chart name',
        example: 'Sales Overview Chart'
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100, { message: 'Chart name must be at most 100 characters long' })
    name: string;

    @ApiProperty({
        description: 'Chart description',
        example: 'A detailed view of monthly sales data',
        required: false
    })
    @IsOptional()
    @IsString()
    @MaxLength(200, { message: 'Chart description must be at most 200 characters long' })
    description?: string;

    @ApiProperty({
        description: 'Chart type',
        example: 'bar',
        enum: ['bar', 'line', 'pie', 'scatter', 'area']
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Chart configuration object with column mappings and visual settings',
        example: {
            xAxis: 'month',
            yAxis: 'sales',
            color: '#3498db',
            showLegend: true
        }
    })
    @IsObject()
    @IsNotEmpty()
    config: any;

    @ApiProperty({
        description: 'Dataset ID that this chart belongs to',
        example: '123e4567-e89b-12d3-a456-426614174000'
    })
    @IsUUID()
    @IsNotEmpty()
    datasetId: string;
}
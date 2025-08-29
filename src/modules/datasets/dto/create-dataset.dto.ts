import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class CreateDatasetDto {
    @ApiProperty({
        description: 'The dataset data as a 2D array of strings',
        example: [
            ['Name', 'Age', 'City', 'Country'],
            ['John Doe', '28', 'New York', 'USA'],
            ['Jane Smith', '34', 'London', 'UK'],
        ],
        type: 'array',
        items: {
            type: 'array',
            items: {
                type: 'string'
            }
        }
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'Dataset must have at least one row' })
    @IsArray({ each: true })
    @ArrayMinSize(1, { each: true, message: 'Each row must have at least one column' })
    data: string[][];

    @ApiProperty({
        description: 'Optional name for the dataset',
        example: 'Customer Demographics Data',
        required: false,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({
        description: 'Optional description for the dataset',
        example: 'Customer data including demographics and location information',
        required: false,
    })
    @IsOptional()
    @IsString()
    description?: string;
}

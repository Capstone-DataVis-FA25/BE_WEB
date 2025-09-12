import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, IsNotEmpty, MinLength, ValidateBy, ValidationOptions, MaxLength } from 'class-validator';

// Custom validator for consistent row lengths
function IsConsistentRowLength(validationOptions?: ValidationOptions) {
    return ValidateBy({
        name: 'isConsistentRowLength',
        validator: {
            validate: (value: any) => {
                if (!Array.isArray(value) || value.length === 0) return true; // Let other validators handle empty arrays

                const firstRowLength = value[0]?.length;
                if (firstRowLength === undefined) return true; // Let other validators handle invalid rows

                return value.every(row => Array.isArray(row) && row.length === firstRowLength);
            },
            defaultMessage: () => 'All rows must have the same number of columns'
        }
    }, validationOptions);
}

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
    @ArrayMinSize(2, { message: 'Dataset must have at least two rows (header and data)' })
    @IsArray({ each: true })
    @ArrayMinSize(1, { each: true, message: 'Each row must have at least one column' })
    @IsConsistentRowLength()
    data: string[][];

    @ApiProperty({
        description: 'Name for the dataset',
        example: 'Customer Demographics Data',
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'Dataset name is required' })
    @MaxLength(20, { message: 'Dataset name must be at most 20 characters long' })
    name: string;

    @ApiProperty({
        description: 'Description for the dataset',
        example: 'Customer data including demographics and location information',
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'Dataset description is required' })
    @MaxLength(100, { message: 'Dataset description must be at most 100 characters long' })
    description: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, IsNotEmpty, MinLength, ValidateBy, ValidationOptions, MaxLength, IsInt, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for individual data headers
export class CreateDataHeaderDto {
    @ApiProperty({
        description: 'Column name',
        example: 'Age'
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Column data type',
        example: 'number',
        enum: ['number', 'string', 'date']
    })
    @IsString()
    @IsIn(['number', 'string', 'date'])
    type: string;

    @ApiProperty({
        description: 'Column position index',
        example: 0
    })
    @IsInt()
    index: number;

    @ApiProperty({
        description: 'Array of column values',
        example: [25, 30, 28, 35]
    })
    @IsArray()
    data: any[];
}

// Custom validator for consistent header data lengths
function IsConsistentHeaderDataLength(validationOptions?: ValidationOptions) {
    return ValidateBy({
        name: 'isConsistentHeaderDataLength',
        validator: {
            validate: (headers: CreateDataHeaderDto[]) => {
                if (!Array.isArray(headers) || headers.length === 0) return true;

                const firstDataLength = headers[0]?.data?.length;
                if (firstDataLength === undefined) return true;

                return headers.every(header =>
                    header.data && Array.isArray(header.data) && header.data.length === firstDataLength
                );
            },
            defaultMessage: () => 'All headers must have the same number of data values'
        }
    }, validationOptions);
}

export class CreateDatasetDto {
    @ApiProperty({
        description: 'Array of data headers with their types and data',
        example: [
            {
                name: 'Name',
                type: 'string',
                index: 0,
                data: ['John Doe', 'Jane Smith', 'Bob Johnson']
            },
            {
                name: 'Age',
                type: 'number',
                index: 1,
                data: [28, 34, 45]
            },
            {
                name: 'City',
                type: 'string',
                index: 2,
                data: ['New York', 'London', 'Paris']
            }
        ],
        type: 'array'
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'Dataset must have at least one column' })
    @ValidateNested({ each: true })
    @Type(() => CreateDataHeaderDto)
    @IsConsistentHeaderDataLength()
    headers: CreateDataHeaderDto[];

    @ApiProperty({
        description: 'Name for the dataset',
        example: 'Customer Demographics',
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'Dataset name is required' })
    @MaxLength(20, { message: 'Dataset name must be at most 20 characters long' })
    name: string;

    @ApiProperty({
        description: 'Description for the dataset',
        example: 'Customer data including demographics and location information',
        required: false,
    })
    @IsString()
    @MaxLength(100, { message: 'Dataset description must be at most 100 characters long' })
    description?: string;
}

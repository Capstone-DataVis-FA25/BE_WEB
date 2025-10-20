import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CleanCsvDto {
  @ApiProperty({
    description: 'Raw CSV text data to be cleaned',
    example: `ID,Name,Age,DateOfBirth,Salary,Bonus\n1,John Doe,28,1997-05-14,1234.56,300`,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500_000, { message: 'CSV too large' })
  csv: string;

  @ApiPropertyOptional({ description: 'Thousands separator', example: ',' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  thousandsSeparator?: string;

  @ApiPropertyOptional({ description: 'Decimal separator', example: '.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  decimalSeparator?: string;

  @ApiPropertyOptional({ description: 'Expected date format', example: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dateFormat?: string;

  @ApiPropertyOptional({
    description: 'CSV schema example (header order and sample rows)',
    example: `ID,Name,Age,DateOfBirth,Salary,Bonus\n1,John Doe,28,1997-05-14,1234.56,300`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  schemaExample?: string;

  @ApiPropertyOptional({ description: 'Cleaning notes' })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}

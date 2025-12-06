import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CleanCsvDto {
  @ApiProperty({
    description: 'Raw CSV text data to be cleaned',
    example: `ID,Name,Age,DateOfBirth,Salary,Bonus,City\n1,John Doe,28,1997-05-14,1234.56,300, Sài Gòn\n2,Jane Smith ,31,1993-11-02,1500.00,400,Thành Phố Hồ Chí Minh\n3,Robert Brown,28,1997-05-14,1234.56,300,Sài Gòn\n4, Emily Davis, 25 ,2000-07-19, 980.5 ,250, Hà Nội\n5,Michael Johnson,35,1989-02-22,1800.75,500,Đà Nẵng\n6,Anna Lee,27,1998-03-10, 1250.00,320, Sài Gòn \n7,John Doe,28,1997-05-14,1234.56,300,Thành Phố Hồ Chí Minh\n8, David Wilson,30,1995-08-25,1400.20,350, Hà Nội\n9,Linda Nguyen ,29,1996-06-12,1300.00,310, Sài Gòn\n10,Robert Brown,28,1997-05-14,1234.56,300,Thành Phố Hồ Chí Minh`,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000000, { message: 'CSV too large' })
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

  // Cleaning options checkboxes
  @ApiPropertyOptional({ description: 'Remove duplicate rows', example: true })
  @IsOptional()
  removeDuplicates?: boolean;

  @ApiPropertyOptional({ description: 'Fix data types (convert strings to numbers, etc)', example: true })
  @IsOptional()
  fixDataTypes?: boolean;

  @ApiPropertyOptional({ description: 'Handle missing values (empty cells)', example: true })
  @IsOptional()
  handleMissingValues?: boolean;

  @ApiPropertyOptional({ description: 'Remove or cap outliers in numeric columns', example: false })
  @IsOptional()
  removeOutliers?: boolean;

  @ApiPropertyOptional({ description: 'Standardize formats (dates, phone numbers, etc)', example: true })
  @IsOptional()
  standardizeFormats?: boolean;

  @ApiPropertyOptional({ description: 'Validate domain constraints', example: false })
  @IsOptional()
  validateDomain?: boolean;

  @ApiPropertyOptional({ description: 'Standardize units (convert to consistent units)', example: false })
  @IsOptional()
  standardizeUnits?: boolean;

  @ApiPropertyOptional({ description: 'User ID thực hiện clean (dùng cho async job)', example: 'user-123' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;
}

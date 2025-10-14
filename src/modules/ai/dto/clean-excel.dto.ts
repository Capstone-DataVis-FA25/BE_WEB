import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CleanExcelUploadDto {
  @ApiProperty({ description: 'Excel/CSV file', type: 'string', format: 'binary' })
  file: any;

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

  @ApiPropertyOptional({ description: 'Date format', example: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dateFormat?: string;

  @ApiPropertyOptional({ description: 'Schema example CSV' })
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

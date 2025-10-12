import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CleanCsvDto {
  @ApiProperty({
    description: 'Raw CSV text data to be cleaned',
    example: `ID,Name,Age,DateOfBirth,Salary,Bonus
1,John D0e,28,14/05/1997,1234.56,three hundred
2,Jane Smith,,1991/03/22,,500
2,Michael Lee,45,1980-13-10,3567.9O,700
4,Sarah-Kim,29,1996-01-3O,1987.25,-
5,David Chen,NaN,07-19-1987,4123.8,600
6,,31,1994-11-05,abc,400
7,Robert Brown,042,1983-09-12,5678.95, 800 
8,NULL,27,1997-02-30,2500.00,?`,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500_000, { message: 'CSV too large' })
  csv: string;

  @ApiPropertyOptional({
    description: 'Character used as thousands separator in numbers',
    example: ',',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  thousandsSeparator?: string;

  @ApiPropertyOptional({
    description: 'Character used as decimal separator in numbers',
    example: '.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  decimalSeparator?: string;

  @ApiPropertyOptional({
    description: 'Expected date format for parsing date fields',
    example: 'DD/MM/YYYY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dateFormat?: string;

  @ApiPropertyOptional({
    description: 'Small CSV excerpt showing header order and example rows',
    example: `ID,Name,Age,DateOfBirth,Salary,Bonus
1,John Doe,28,1997-05-14,1234.56,300`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  schemaExample?: string;

  @ApiPropertyOptional({
    description: 'Any special cleaning or formatting notes',
    example: 'Remove duplicates and normalize date formats to YYYY-MM-DD.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  notes?: string;
}

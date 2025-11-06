import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RestoreChartDto {
  @ApiProperty({
    description: 'ID of the chart history record to restore from',
    example: 'clx1234567890abcdef',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'History ID is required' })
  historyId: string;

  @ApiPropertyOptional({
    description: 'Note about why restoring this version',
    example: 'Reverting to previous layout',
  })
  @IsOptional()
  @IsString()
  changeNote?: string;
}

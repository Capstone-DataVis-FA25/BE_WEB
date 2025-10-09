import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChartNoteDto {
  @ApiProperty({
    description: 'The ID of the chart this note belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsUUID()
  chartId: string;

  @ApiProperty({
    description: 'The content of the note',
    example: 'This chart shows an interesting trend in Q4 2024',
  })
  @IsNotEmpty()
  @IsString()
  content: string;
}

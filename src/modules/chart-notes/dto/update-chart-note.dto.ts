import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateChartNoteDto {
  @ApiProperty({
    description: 'The updated content of the note',
    example: 'Updated note content with new insights',
    required: false,
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: 'Whether the note is completed',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

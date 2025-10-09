import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateChartNoteDto {
  @ApiProperty({
    description: 'The updated content of the note',
    example: 'Updated note content with new insights',
  })
  @IsNotEmpty()
  @IsString()
  content: string;
}

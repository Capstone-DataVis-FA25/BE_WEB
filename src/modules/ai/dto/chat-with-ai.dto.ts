import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChatWithAiDto {
  

  @ApiPropertyOptional({
    description: 'Message to send to AI',
    example: 'What is the main topic of this document?'
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'JSON array history [{role,content}]',
    example: '[{"role":"user","content":"What is the summary?"},{"role":"assistant","content":"The summary is ..."}]'
  })
  @IsOptional()
  @IsString()
  messages?: string;

  @ApiPropertyOptional({
    description: 'Language code',
    example: 'en'
  })
  @IsOptional()
  @IsString()
  language?: string;
}
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class ChatWithAiDto {
  @ApiPropertyOptional({
    description: "Message to send to AI",
    example: "What is the main topic of this document?",
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: "JSON array history [{role,content}]",
    example:
      '[{"role":"user","content":"What is the summary?"},{"role":"assistant","content":"The summary is ..."}]',
  })
  @IsOptional()
  @IsString()
  messages?: string;

  @ApiPropertyOptional({
    description: "Language code",
    example: "en",
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: "Dataset ID context for chart generation",
    example: "cmfp0xm9v0001193gt2vmnyf4",
  })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiPropertyOptional({
    description: "User ID for fetching user datasets (auto-filled from auth)",
    example: "user-uuid",
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

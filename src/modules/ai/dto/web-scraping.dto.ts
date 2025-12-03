import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, IsOptional, IsArray, MaxLength, IsEnum } from 'class-validator';

export enum ScrapingType {
  TEXT = 'text',
  TABLE = 'table', 
  LINKS = 'links',
  IMAGES = 'images',
  ALL = 'all'
}

export class WebScrapingDto {
  @ApiProperty({
    description: 'URL of the website to scrape',
    example: 'https://example.com/data'
  })
  @IsUrl({}, { message: 'Please provide a valid URL' })
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    description: 'Type of content to scrape',
    enum: ScrapingType,
    example: ScrapingType.ALL
  })
  @IsOptional()
  @IsEnum(ScrapingType)
  scrapingType?: ScrapingType = ScrapingType.ALL;

  @ApiPropertyOptional({
    description: 'CSS selectors to target specific elements',
    example: ['table.data-table', '.content-section', '#main-content']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectors?: string[];

  @ApiPropertyOptional({
    description: 'Additional instructions for AI analysis',
    example: 'Focus on financial data and extract numerical values'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  analysisInstructions?: string;

  @ApiPropertyOptional({
    description: 'Whether to follow pagination or load more content',
    example: false
  })
  @IsOptional()
  followPagination?: boolean = false;

  @ApiPropertyOptional({
    description: 'Maximum pages to scrape if pagination is enabled',
    example: 5
  })
  @IsOptional()
  maxPages?: number = 5;
}

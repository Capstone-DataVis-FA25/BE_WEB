import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Express } from 'express';
import { AiCleanerService } from './ai-cleaner.service';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { CleanExcelUploadDto } from './dto/clean-excel.dto';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';


@ApiTags('ai-cleaner')
@Controller('ai-cleaner')
export class AiCleanerController {
  constructor(private readonly aiCleanerService: AiCleanerService) {}

  @Post('clean')
  @HttpCode(HttpStatus.OK)
  async clean(@Body() body: CleanCsvDto) {
    const cleanedCsv = await this.aiCleanerService.cleanCsv(body);
    return { cleanedCsv };
  }

  @Post('clean-excel')
  @ApiOperation({ summary: 'Clean data from an uploaded Excel/CSV file and return a 2D JSON array' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CleanExcelUploadDto })
  @ApiOkResponse({ description: '2D JSON array of cleaned data', schema: { type: 'array', items: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] } } } })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async cleanExcel(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, 'file'>,
  ) {
    const result = await this.aiCleanerService.cleanExcelToMatrix({ file, options: body });
    return result;
  }
}

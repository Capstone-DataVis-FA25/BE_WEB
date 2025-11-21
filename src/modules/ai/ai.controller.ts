import { Controller, Post, Body, HttpException, HttpStatus, UploadedFile, UseInterceptors, HttpCode } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from '@modules/ai/ai.service';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { CleanExcelUploadDto } from './dto/clean-excel.dto';
import { ChatWithAiDto } from './dto/chat-with-ai.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat-with-ai')
  @ApiBody({ type: ChatWithAiDto })
  async chatWithAi(@Body() body: ChatWithAiDto) {
    if (!body.message) throw new HttpException('❌ Vui lòng gửi tin nhắn', HttpStatus.BAD_REQUEST);
    try {
      return await this.aiService.chatWithAi( body.message, body.messages, body.language);
    } catch (e: any) {
      throw new HttpException({ success: false, message: e.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Clean raw CSV via AI
  @Post('clean')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean CSV data and return a 2D JSON array' })
  @ApiOkResponse({ 
    description: '2D JSON array of cleaned data', 
    schema: { 
      type: 'object',
      properties: {
        data: {
          type: 'array', 
          items: { 
            type: 'array', 
            items: { 
              oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] 
            } 
          }
        },
        rowCount: { type: 'number' },
        columnCount: { type: 'number' }
      }
    } 
  })
  async clean(@Body() body: CleanCsvDto) {
    const result = await this.aiService.cleanCsv(body);
    return result;
  }

  // Clean uploaded Excel/CSV and return a 2D JSON matrix via AI
  @Post('clean-excel')
  @ApiOperation({ summary: 'Clean data from an uploaded Excel/CSV file and return a 2D JSON array' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CleanExcelUploadDto })
  @ApiOkResponse({ 
    description: '2D JSON array of cleaned data', 
    schema: { 
      type: 'object',
      properties: {
        data: {
          type: 'array', 
          items: { 
            type: 'array', 
            items: { 
              oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] 
            } 
          }
        },
        rowCount: { type: 'number' },
        columnCount: { type: 'number' }
      }
    } 
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async cleanExcel(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, 'file'>,
  ) {

    const result = await this.aiService.cleanLargeCsvToMatrix({ file, options: body });
    return result;
  }
}

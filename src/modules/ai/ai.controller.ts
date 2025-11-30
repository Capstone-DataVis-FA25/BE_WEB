import { Controller, Post, Body, HttpException, HttpStatus, UploadedFile, UseInterceptors, HttpCode, Query, Get, Req } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AiService } from '@modules/ai/ai.service';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { CleanExcelUploadDto } from './dto/clean-excel.dto';
import { ChatWithAiDto } from './dto/chat-with-ai.dto';
import { AiCleanJobService } from './ai.clean.job';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiCleanJobService: AiCleanJobService,
  ) {}

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
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    storage: diskStorage({}), // default, can be customized
  }))
  @HttpCode(HttpStatus.OK)
  async cleanExcel(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, 'file'>,
  ) {
    const result = await this.aiService.cleanExcelToMatrix({ file, options: body });
    return result;
  }

  // Clean raw CSV via AI (ASYNC, returns jobId, not result)
  @Post('clean-async')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean CSV data async, return jobId, notify user when done' })
  @ApiOkResponse({ description: 'Job started', schema: { type: 'object', properties: { jobId: { type: 'string' } } } })
  async cleanAsync(@Body() body: CleanCsvDto, @Req() req: any) {
    // Lấy userId từ req (tuỳ auth, demo lấy từ req.body.userId hoặc req.user)
    const userId = req.user?.id || body.userId || req.body.userId;
    if (!userId) throw new HttpException('Missing userId', HttpStatus.BAD_REQUEST);
    const jobId = this.aiCleanJobService.createJob(userId, body);
    return { jobId };
  }

  // Lấy kết quả job (và xoá job khỏi store)
  @Get('clean-result')
  @ApiOperation({ summary: 'Get cleaned dataset by jobId (one-time fetch, then deleted)' })
  @ApiOkResponse({ description: 'Cleaned dataset', schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] } }, }, rowCount: { type: 'number' }, columnCount: { type: 'number' } } } })
  async getCleanResult(@Query('jobId') jobId: string) {
    if (!jobId) throw new HttpException('Missing jobId', HttpStatus.BAD_REQUEST);
    const result = this.aiCleanJobService.getJobResult(jobId);
    if (!result) throw new HttpException('Job not found or expired', HttpStatus.NOT_FOUND);
    return result;
  }

  // Clean uploaded Excel/CSV file via AI (ASYNC, returns jobId, not result)
  @Post('clean-excel-async')
  @ApiOperation({ summary: 'Clean uploaded Excel/CSV file async, return jobId, notify user when done' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CleanExcelUploadDto })
  @ApiOkResponse({ description: 'Job started', schema: { type: 'object', properties: { jobId: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    storage: diskStorage({}),
  }))
  @HttpCode(HttpStatus.OK)
  async cleanExcelAsync(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, 'file'> & { userId?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.id || body.userId || req.body?.userId;
    if (!userId) throw new HttpException('Missing userId', HttpStatus.BAD_REQUEST);
    // Tạo payload tương tự cleanExcelToMatrix, tuỳ logic bạn có thể convert file -> csv string hoặc truyền file object
    const jobId = this.aiCleanJobService.createJob(userId, { file, options: body });
    return { jobId };
  }
}

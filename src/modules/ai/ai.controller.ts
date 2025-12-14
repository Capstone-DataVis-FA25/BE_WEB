import { Controller, Post, Body, HttpException, HttpStatus, UploadedFile, UseInterceptors, HttpCode, Query, Get, Req, UseGuards, Request, Param } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AiService } from '@modules/ai/ai.service';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { CleanExcelUploadDto } from './dto/clean-excel.dto';
import { ChatWithAiDto } from './dto/chat-with-ai.dto';
import { AiCleanJobService } from './ai.clean.job';
import { EvaluateChartDto } from './dto/evaluate-chart.dto';
import { AiChartEvaluationService } from './ai.chart-evaluation.service';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';
import { ForecastDto } from './dto/forecast.dto';
import { ForecastProcessingService } from '../forecasts/forecast-processing.service';
import { ForecastCreationJobService } from '../forecasts/forecast-creation.job';


@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiCleanJobService: AiCleanJobService,
    private readonly aiChartEvaluationService: AiChartEvaluationService,
    private readonly forecastProcessingService: ForecastProcessingService,
    private readonly forecastCreationJobService: ForecastCreationJobService,
  ) { }

  @Post('chat-with-ai')
  @ApiBody({ type: ChatWithAiDto })
  async chatWithAi(@Body() body: ChatWithAiDto) {
    if (!body.message) throw new HttpException('❌ Vui lòng gửi tin nhắn', HttpStatus.BAD_REQUEST);
    try {
      return await this.aiService.chatWithAi(body.message, body.messages, body.language);
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

    // Đưa thêm metadata fileSize để service tính được dung lượng file đã clean
    const payload = {
      file,
      options: body,
      fileSize: typeof file?.size === 'number' ? file.size : undefined,
      originalName: file?.originalname,
    };

    const jobId = this.aiCleanJobService.createJob(userId, payload);
    return { jobId };
  }

  // --- NEW: user-specific history & cancel endpoints ---

  @Get('clean-history')
  @ApiOperation({ summary: 'Get AI cleaning history for the current user' })
  @ApiQuery({ name: 'userId', required: false, description: 'Optional: userId for debugging (if no auth). When authenticated, leave empty.' })
  @ApiOkResponse({
    description: 'List of cleaning jobs for the user',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          inputSize: { type: 'number' },
        },
      },
    },
  })
  async getCleanHistory(@Req() req: any) {
    const userId = req.user?.id || req.query.userId || req.body?.userId;
    if (!userId) throw new HttpException('Missing userId', HttpStatus.BAD_REQUEST);
    const history = this.aiCleanJobService.getUserHistory(userId);
    return history;
  }

  @Post('clean-cancel')
  @ApiOperation({ summary: 'Cancel a pending AI cleaning job for the current user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        userId: { type: 'string', description: 'Optional: userId for debugging (if no auth). When authenticated, leave empty.' },
      },
      required: ['jobId'],
    },
  })
  @ApiOkResponse({
    description: 'Cancel result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  async cancelCleanJob(@Body() body: { jobId: string; userId?: string }, @Req() req: any) {
    const jobId = body?.jobId;
    if (!jobId) throw new HttpException('Missing jobId', HttpStatus.BAD_REQUEST);
    const userId = req.user?.id || body?.userId || req.body?.userId || req.query?.userId;
    if (!userId) throw new HttpException('Missing userId', HttpStatus.BAD_REQUEST);

    // Optional: ensure user only cancels their own job
    const history = this.aiCleanJobService.getUserHistory(userId);
    const ownsJob = history.some(j => j.jobId === jobId);
    if (!ownsJob) {
      throw new HttpException('Job not found for this user', HttpStatus.NOT_FOUND);
    }

    const success = this.aiCleanJobService.cancelJob(jobId);
    if (!success) {
      throw new HttpException('Unable to cancel job (maybe already done/error)', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }

  @Get('clean-jobs')
  @ApiOperation({ summary: 'List all AI cleaning jobs (optional status filter). For debugging — not admin-protected.' })
  @ApiQuery({ name: 'status', required: false, description: 'Optional status to filter: pending, done, error, cancelled' })
  @ApiOkResponse({ description: 'List of jobs', schema: { type: 'array', items: { type: 'object' } } })
  async listAllJobs(@Query('status') status?: string) {
    const filter = status ? { status: status as any } : undefined;
    const jobs = this.aiCleanJobService.getAllJobs(filter);
    return { code: 200, message: 'Success', data: jobs };
  }

  @Get('clean-pending')
  @ApiOperation({ summary: 'Return list of pending jobIds' })
  @ApiOkResponse({ description: 'Pending jobIds', schema: { type: 'object', properties: { pending: { type: 'array', items: { type: 'string' } } } } })
  async listPendingJobs() {
    const ids = this.aiCleanJobService.getPendingJobIds();
    return { code: 200, message: 'Success', data: ids };
  }

  @Post('evaluate-chart')
  @UseGuards(JwtAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate a chart using AI based on its image and dataset',
    description: 'Send chart image (base64) and chart ID to get AI-powered evaluation and recommendations'
  })
  @ApiBody({ type: EvaluateChartDto })
  @ApiOkResponse({
    description: 'Chart evaluation completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        evaluation: { type: 'string' },
        chartInfo: { type: 'object' },
        datasetInfo: { type: 'object' },
        processingTime: { type: 'number' }
      }
    }
  })
  async evaluateChart(@Body() dto: EvaluateChartDto, @Request() req: AuthRequest) {
    try {
      const result = await this.aiChartEvaluationService.evaluateChart(dto, req.user.userId);
      return result;
    } catch (e: any) {
      throw new HttpException(
        { success: false, message: e.message },
        e.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get('clean-progress')
  @ApiOperation({ summary: 'Get current cleaning progress for a jobId' })
  @ApiQuery({ name: 'jobId', required: true, description: 'Job ID to check progress' })
  @ApiOkResponse({
    description: 'Current progress',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string' },
        progress: { type: 'number' },
        totalChunks: { type: 'number' },
        completedChunks: { type: 'number' }
      }
    }
  })
  async getCleanProgress(@Query('jobId') jobId: string) {
    if (!jobId) throw new HttpException('Missing jobId', HttpStatus.BAD_REQUEST);
    const progress = this.aiCleanJobService.getJobProgress(jobId);
    if (!progress) throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    return { code: 200, message: 'Success', data: progress };
  }

  @Post('forecast')
  @UseGuards(JwtAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate time series forecast (async)',
    description: 'Starts an async job to generate time series forecasts. Returns jobId immediately. You will be notified when the forecast is complete.'
  })
  @ApiBody({ type: ForecastDto })
  @ApiOkResponse({
    description: 'Forecast job started',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        jobId: { type: 'string' },
        message: { type: 'string' }
      }
    }
  })
  async forecast(@Body() dto: ForecastDto, @Request() req: AuthRequest) {
    try {
      const userId = req.user.userId || req.user.sub;

      // Create async job and return jobId immediately
      const jobId = this.forecastCreationJobService.createJob(userId, dto);

      return {
        success: true,
        jobId,
        message: 'Forecast job started. You will be notified when it completes.',
      };
    } catch (e: any) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(
        e.message || 'Failed to start forecast job',
        e.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('forecast/:jobId/status')
  @UseGuards(JwtAccessTokenGuard)
  @ApiOperation({ summary: 'Get forecast creation job status' })
  getForecastJobStatus(@Param('jobId') jobId: string, @Request() req: AuthRequest) {
    const status = this.forecastCreationJobService.getJobStatus(jobId);
    if (!status) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
    return status;
  }

  @Get('forecast/:jobId/result')
  @UseGuards(JwtAccessTokenGuard)
  @ApiOperation({ summary: 'Get forecast creation job result' })
  getForecastJobResult(@Param('jobId') jobId: string, @Request() req: AuthRequest) {
    const result = this.forecastCreationJobService.getJobResult(jobId);
    if (!result) {
      throw new HttpException('Job not found or not completed', HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
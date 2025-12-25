import {
  Request,
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  Query,
  Get,
  Req,
  UseGuards,
  Param,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { AiService } from "@modules/ai/ai.service";
import { AiRequestService } from "./ai-request.service";
import { CleanCsvDto } from "./dto/clean-csv.dto";
import { CleanExcelUploadDto } from "./dto/clean-excel.dto";
import { ChatWithAiDto } from "./dto/chat-with-ai.dto";
import {
  GenerateChartConfigDto,
  GenerateChartConfigResponseDto,
} from "./dto/generate-chart-config.dto";
import { AiCleanJobService } from "./ai.clean.job";
import { PrismaService } from "../../prisma/prisma.service";
import { DatasetsService } from "../datasets/datasets.service";
import { AiChartEvaluationService } from "./ai.chart-evaluation.service";
import { JwtAccessTokenGuard } from "@modules/auth/guards/jwt-access-token.guard";
import { AiRequestGuard } from "./guards/ai-request.guard";
import { EvaluateChartDto } from "./dto/evaluate-chart.dto";
import { AuthRequest } from "@modules/auth/auth.controller";
import { ForecastProcessingService } from "@modules/forecasts/forecast-processing.service";
import { ForecastCreationJobService } from "@modules/forecasts/forecast-creation.job";
import { ForecastDto } from "./dto/forecast.dto";

@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiRequestService: AiRequestService,
    private readonly aiCleanJobService: AiCleanJobService,
    private readonly aiChartEvaluationService: AiChartEvaluationService,
    private readonly prismaService: PrismaService,
    private readonly datasetsService: DatasetsService,
    private readonly forecastProcessingService: ForecastProcessingService,
    private readonly forecastCreationJobService: ForecastCreationJobService,
  ) { }

  @Post("chat-with-ai")
  @UseGuards(JwtAccessTokenGuard)
  @ApiBody({ type: ChatWithAiDto })
  @ApiOperation({ summary: 'Chat with AI assistant, auto-detect dataset requests' })
  async chatWithAi(@Body() body: ChatWithAiDto, @Req() req: any) {
    if (!body.message)
      throw new HttpException(
        "Please send the message",
        HttpStatus.BAD_REQUEST
      );
    try {
      const userId = req.user?.userId || req.user?.id;

      // Call the Agentic Service
      const agentResult = await this.aiService.processUserRequest(
        userId,
        body.message,
        body.messages,
        body.language
      );

      const lang = (agentResult.language || body.language || '').toLowerCase();

      console.log("[DEBUG] Agent Action:", agentResult.action);
      console.log("[DEBUG] Agent Params:", agentResult.params);

      // --- HANDLE AGENT ACTIONS ---

      // 1. CREATE CHART
      if (agentResult.action === 'create_chart') {
        const params = agentResult.params || {};

        // If we have a dataset context, proceed to generation
        if (body.datasetId) {
          const specificTypeFromAgent = params.chartType && params.chartType !== 'auto' ? params.chartType : null;
          const effectiveChartType = specificTypeFromAgent || body.chartType || 'auto';

          return await this.handleChartGeneration(
            params.description || body.message,
            body.datasetId,
            userId,
            effectiveChartType,
            lang
          );
        } else {
          // No dataset selected -> Show list
          const datasets = params.datasets || await this.getUserDatasets(userId);
          return await this.handleChartRequestWithoutDataset(body.message, datasets, lang, agentResult.reply);
        }
      }

      // 2. LIST DATASETS
      if (agentResult.action === 'list_datasets') {
        const datasets = agentResult.params?.datasets || await this.getUserDatasets(userId);
        return await this.showDatasetList(datasets, lang, agentResult.reply);
      }

      // 3. CLEAN DATA (Suggestion)
      if (agentResult.action === 'clean_data') {
        // Return a text reply (if any) plus an action flag for the UI to maybe open a modal?
        // For now, just return specific text helper + action flag
        const fallbackClean = await this.localizeReply(
          'I can help clean your data. Please upload a CSV/Excel file or pick a dataset.',
          lang,
        );
        return {
          reply: agentResult.reply || fallbackClean,
          success: true,
          action: 'clean_data', // Frontend might react to this
        };
      }

      // 4. DOCUMENTATION / GENERAL CHAT
      // Returning the text response directly
      const lowerMsg = (body.message || '').toLowerCase();
      const mentionsChart = ['chart', 'biểu đồ', 'graph', 'plot', 'visual', 'visualization'].some(k => lowerMsg.includes(k));
      const mentionsDataset = ['dataset', 'data set', 'dữ liệu', 'data file', 'file dữ liệu'].some(k => lowerMsg.includes(k));

      // Fallback: if user already picked a dataset, auto-generate chart instead of asking for headers
      if (body.datasetId && mentionsChart) {
        return await this.handleChartGeneration(
          body.message,
          body.datasetId,
          userId,
          body.chartType || 'auto',
          lang
        );
      }

      // If user is talking about chart/dataset but no datasetId provided, proactively list datasets
      if (!body.datasetId && (mentionsChart || mentionsDataset)) {
        const datasets = await this.getUserDatasets(userId);
        return await this.showDatasetList(datasets, lang);
      }

      return {
        reply: agentResult.reply,
        success: true,
        action: agentResult.action || 'general_chat',
        processingTime: agentResult.processingTime
      };

    } catch (e: any) {
      console.error("[AiController] Error:", e);
      throw new HttpException(
        { success: false, message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }



  private async getUserDatasets(userId: string) {
    // Use DatasetsService to get user's datasets
    return await this.datasetsService.findAll(userId);
  }

  private async showDatasetList(datasets: any[], language?: string, aiReply?: string) {
    const lang = (language || '').toLowerCase();

    if (aiReply) {
      return {
        reply: aiReply,
        success: true,
        needsDatasetSelection: true,
        datasets,
      };
    }

    if (datasets.length === 0) {
      const fallback = await this.localizeReply(
        '**You have no datasets yet!**\n\nTo create a chart, please:\n1. Go to **Datasets**\n2. Click **Upload Dataset** to add your data\n3. Come back and select a dataset to create a chart\n\n💡 Or use built-in sample data to try quickly!',
        lang,
      );
      return {
        reply: fallback,
        success: true,
        needsDatasetSelection: true,
        datasets: [],
      };
    }

    const fallbackList = await this.localizeReply(
      `**Your Datasets**\n\nYou have ${datasets.length} dataset${datasets.length > 1 ? 's' : ''}.\n\nWhen ready, pick one and describe the chart you want!`,
      lang,
    );

    return {
      reply: fallbackList,
      success: true,
      needsDatasetSelection: true,
      datasets: datasets,
    };
  }

  private async handleChartRequestWithoutDataset(
    message: string,
    datasets: any[],
    language?: string,
    aiReply?: string,
  ) {
    const lang = (language || '').toLowerCase();

    if (aiReply) {
      return {
        reply: aiReply,
        success: true,
        needsDatasetSelection: true,
        datasets,
      };
    }

    if (datasets.length === 0) {
      const fallback = await this.localizeReply(
        '**You have no datasets yet!**\n\nTo create a chart, please:\n1. Go to **Datasets**\n2. Click **Upload Dataset** to add your data\n3. Come back and select a dataset to create a chart\n\n💡 Or use built-in sample data to try quickly!',
        lang,
      );
      return {
        reply: fallback,
        success: true,
        needsDatasetSelection: true,
        datasets: [],
      };
    }

    const fallbackPrompt = await this.localizeReply(
      `**Choose a dataset to create a chart**\n\nYou have ${datasets.length} dataset${datasets.length > 1 ? 's' : ''}.\n\nPlease pick one from the list, then describe the chart you want!`,
      lang,
    );

    return {
      reply: fallbackPrompt,
      success: true,
      needsDatasetSelection: true,
      datasets: datasets,
    };
  }

  private async handleChartGeneration(
    message: string,
    datasetId: string,
    userId: string,
    chartType?: string,
    language?: string,
  ) {
    try {
      const lang = (language || '').toLowerCase();

      // Fetch dataset with headers
      const dataset = await this.prismaService.prisma.dataset.findUnique({
        where: { id: datasetId },
        include: {
          headers: {
            orderBy: { index: "asc" },
          },
        },
      });

      if (!dataset) {
        return {
          reply: await this.localizeReply('❌ Dataset not found. Please select a valid dataset.', lang),
          success: false,
        };
      }

      if (dataset.userId !== userId) {
        return {
          reply: await this.localizeReply('❌ You do not have permission to access this dataset.', lang),
          success: false,
        };
      }

      // Generate chart config
      const headers = dataset.headers.map((h) => ({
        id: h.id,
        name: h.name,
        type: h.type,
      }));

      const result = await this.aiService.generateChartConfig({
        prompt: message,
        datasetId: datasetId,
        headers,
        chartType: chartType || 'auto',
      });

      // Create chart in database with AI-generated config
      const chartName = result.suggestedName || result.config.title || "AI Generated Chart";
      // Format: [Type] - [Name] (e.g., "Line - Monthly Sales")
      const formattedName = `${result.type.charAt(0).toUpperCase() + result.type.slice(1)} - ${chartName}`;

      const createdChart = await this.prismaService.prisma.chart.create({
        data: {
          userId,
          datasetId,
          name: formattedName,
          description: `AI-generated ${result.type} chart`,
          type: result.type,
          config: result.config,
        },
      });

      // Return chart URL for edit mode with full URL
      const chartUrl = `/chart-editor?chartId=${createdChart.id}`;

      const successReply = await this.localizeReply(
        `Chart created successfully ✅\n\n **${result.config.title}**\n\n🔗 [**Open Chart Editor →**](${chartUrl})\n\n Click to view and edit the chart!`,
        lang,
      );

      return {
        reply: successReply,
        success: true,
        chartGenerated: true,
        chartData: {
          ...result,
          chartUrl: chartUrl,
        },
      };
    } catch (error: any) {
      const errReply = await this.localizeReply(`❌ ${error.message}`, language);
      return {
        reply: errReply,
        success: false,
      };
    }
  }

  // Simple helper: ask AI to express fallback text in the target language; falls back to original text on error
  private async localizeReply(text: string, language?: string) {
    const target = language && language !== 'auto' ? language : undefined;
    if (!target) return text;
    try {
      const res = await this.aiService.chatWithAi(text, undefined, target);
      return res?.reply || text;
    } catch {
      return text;
    }
  }

  // Clean raw CSV via AI
  @Post("clean")
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Clean CSV data and return a 2D JSON array" })
  @ApiOkResponse({
    description: "2D JSON array of cleaned data",
    schema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "array",
            items: {
              oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
            },
          },
        },
        rowCount: { type: "number" },
        columnCount: { type: "number" },
      },
    },
  })
  async clean(@Body() body: CleanCsvDto) {
    const result = await this.aiService.cleanCsv(body);
    return result;
  }

  // Clean uploaded Excel/CSV and return a 2D JSON matrix via AI
  @Post("clean-excel")
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
  @ApiOperation({
    summary:
      "Clean data from an uploaded Excel/CSV file and return a 2D JSON array",
  })
  @ApiConsumes("multipart/form-data")
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
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      storage: diskStorage({}), // default, can be customized
    })
  )
  @HttpCode(HttpStatus.OK)
  async cleanExcel(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, "file">
  ) {
    const result = await this.aiService.cleanExcelToMatrix({
      file,
      options: body,
    });
    return result;
  }

  // Clean raw CSV via AI (ASYNC, returns jobId, not result)
  @Post("clean-async")
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Clean CSV data async, return jobId, notify user when done",
  })
  @ApiOkResponse({
    description: "Job started",
    schema: { type: "object", properties: { jobId: { type: "string" } } },
  })
  async cleanAsync(@Body() body: CleanCsvDto, @Req() req: any) {
    const userId = req.user?.id || body.userId || req.body.userId;
    if (!userId)
      throw new HttpException("Missing userId", HttpStatus.BAD_REQUEST);
    const jobId = this.aiCleanJobService.createJob(userId, body);
    return { jobId };
  }

  // Lấy kết quả job (và xoá job khỏi store)
  @Get("clean-result")
  @ApiOperation({
    summary: "Get cleaned dataset by jobId (one-time fetch, then deleted)",
  })
  @ApiOkResponse({
    description: "Cleaned dataset",
    schema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "array",
            items: {
              oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
            },
          },
        },
        rowCount: { type: "number" },
        columnCount: { type: "number" },
      },
    },
  })
  async getCleanResult(@Query("jobId") jobId: string) {
    if (!jobId)
      throw new HttpException("Missing jobId", HttpStatus.BAD_REQUEST);
    const result = this.aiCleanJobService.getJobResult(jobId);
    if (!result)
      throw new HttpException("Job not found or expired", HttpStatus.NOT_FOUND);
    return result;
  }

  // Clean uploaded Excel/CSV file via AI (ASYNC, returns jobId, not result)
  @Post("clean-excel-async")
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
  @ApiOperation({
    summary:
      "Clean uploaded Excel/CSV file async, return jobId, notify user when done",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CleanExcelUploadDto })
  @ApiOkResponse({
    description: "Job started",
    schema: { type: "object", properties: { jobId: { type: "string" } } },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      storage: diskStorage({}),
    })
  )
  @HttpCode(HttpStatus.OK)
  async cleanExcelAsync(
    @UploadedFile() file: any,
    @Body() body: Omit<CleanExcelUploadDto, "file"> & { userId?: string },
    @Req() req: any
  ) {
    const userId = req.user?.id || body.userId || req.body?.userId;
    if (!userId)
      throw new HttpException("Missing userId", HttpStatus.BAD_REQUEST);

    // Đưa thêm metadata fileSize để service tính được dung lượng file đã clean
    const payload = {
      file,
      options: body,
      fileSize: typeof file?.size === "number" ? file.size : undefined,
      originalName: file?.originalname,
    };

    const jobId = this.aiCleanJobService.createJob(userId, payload);
    return { jobId };
  }

  // --- NEW: user-specific history & cancel endpoints ---

  @Get("clean-history")
  @ApiOperation({ summary: "Get AI cleaning history for the current user" })
  @ApiQuery({
    name: "userId",
    required: false,
    description:
      "Optional: userId for debugging (if no auth). When authenticated, leave empty.",
  })
  @ApiOkResponse({
    description: "List of cleaning jobs for the user",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          status: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          inputSize: { type: "number" },
        },
      },
    },
  })
  async getCleanHistory(@Req() req: any) {
    const userId = req.user?.id || req.query.userId || req.body?.userId;
    if (!userId)
      throw new HttpException("Missing userId", HttpStatus.BAD_REQUEST);
    const history = this.aiCleanJobService.getUserHistory(userId);
    return history;
  }

  @Post("clean-cancel")
  @ApiOperation({
    summary: "Cancel a pending AI cleaning job for the current user",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        userId: {
          type: "string",
          description:
            "Optional: userId for debugging (if no auth). When authenticated, leave empty.",
        },
      },
      required: ["jobId"],
    },
  })
  @ApiOkResponse({
    description: "Cancel result",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
  })
  async cancelCleanJob(
    @Body() body: { jobId: string; userId?: string },
    @Req() req: any
  ) {
    const jobId = body?.jobId;
    if (!jobId)
      throw new HttpException("Missing jobId", HttpStatus.BAD_REQUEST);
    const userId =
      req.user?.id || body?.userId || req.body?.userId || req.query?.userId;
    if (!userId)
      throw new HttpException("Missing userId", HttpStatus.BAD_REQUEST);

    // Optional: ensure user only cancels their own job
    const history = this.aiCleanJobService.getUserHistory(userId);
    const ownsJob = history.some((j) => j.jobId === jobId);
    if (!ownsJob) {
      throw new HttpException(
        "Job not found for this user",
        HttpStatus.NOT_FOUND
      );
    }

    const success = this.aiCleanJobService.cancelJob(jobId);
    if (!success) {
      throw new HttpException(
        "Unable to cancel job (maybe already done/error)",
        HttpStatus.BAD_REQUEST
      );
    }
    return { success: true };
  }

  @Get("clean-jobs")
  @ApiOperation({
    summary:
      "List all AI cleaning jobs (optional status filter). For debugging — not admin-protected.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Optional status to filter: pending, done, error, cancelled",
  })
  @ApiOkResponse({
    description: "List of jobs",
    schema: { type: "array", items: { type: "object" } },
  })
  async listAllJobs(@Query("status") status?: string) {
    const filter = status ? { status: status as any } : undefined;
    const jobs = this.aiCleanJobService.getAllJobs(filter);
    return { code: 200, message: "Success", data: jobs };
  }

  @Get("clean-pending")
  @ApiOperation({ summary: "Return list of pending jobIds" })
  @ApiOkResponse({
    description: "Pending jobIds",
    schema: {
      type: "object",
      properties: { pending: { type: "array", items: { type: "string" } } },
    },
  })
  async listPendingJobs() {
    const ids = this.aiCleanJobService.getPendingJobIds();
    return { code: 200, message: "Success", data: ids };
  }

  @Post('evaluate-chart')
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
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

  @Get("clean-progress")
  @ApiOperation({ summary: "Get current cleaning progress for a jobId" })
  @ApiQuery({
    name: "jobId",
    required: true,
    description: "Job ID to check progress",
  })
  @ApiOkResponse({
    description: "Current progress",
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        status: { type: "string" },
        progress: { type: "number" },
        totalChunks: { type: "number" },
        completedChunks: { type: "number" },
      },
    },
  })
  async getCleanProgress(@Query("jobId") jobId: string) {
    if (!jobId)
      throw new HttpException("Missing jobId", HttpStatus.BAD_REQUEST);
    const progress = this.aiCleanJobService.getJobProgress(jobId);
    if (!progress)
      throw new HttpException("Job not found", HttpStatus.NOT_FOUND);
    return { code: 200, message: "Success", data: progress };
  }

  @Post("generate-chart-config")
  @ApiOperation({
    summary: "Generate chart configuration from natural language prompt",
  })
  @ApiBody({ type: GenerateChartConfigDto })
  @ApiOkResponse({ type: GenerateChartConfigResponseDto })
  async generateChartConfig(
    @Body() body: GenerateChartConfigDto,
    @Req() req: any
  ) {
    try {
      const userId = req.user?.id || req.user?.userId || body.userId;
      if (!userId) {
        throw new HttpException(
          "User authentication required",
          HttpStatus.UNAUTHORIZED
        );
      }

      // Fetch dataset with headers
      const dataset = await this.prismaService.prisma.dataset.findUnique({
        where: { id: body.datasetId },
        include: {
          headers: {
            orderBy: { index: "asc" },
          },
        },
      });

      if (!dataset) {
        throw new HttpException("Dataset not found", HttpStatus.NOT_FOUND);
      }

      if (dataset.userId !== userId) {
        throw new HttpException(
          "You do not have access to this dataset",
          HttpStatus.FORBIDDEN
        );
      }

      // Map headers to format expected by AI service
      const headers = dataset.headers.map((h) => ({
        id: h.id,
        name: h.name,
        type: h.type,
      }));

      // Generate chart config using AI
      const result = await this.aiService.generateChartConfig({
        prompt: body.prompt,
        datasetId: body.datasetId,
        headers,
      });

      return {
        code: 200,
        message: "Chart configuration generated successfully",
        data: result,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Post('forecast')
  @UseGuards(JwtAccessTokenGuard, AiRequestGuard)
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
      // If user already has an active job, return 409 Conflict
      if (e.message?.includes('already have a forecast in progress')) {
        throw new HttpException(
          {
            success: false,
            message: e.message,
          },
          HttpStatus.CONFLICT
        );
      }
      throw new HttpException(
        {
          success: false,
          message: e.message || 'Failed to start forecast job',
        },
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

  @Get('request-status')
  @UseGuards(JwtAccessTokenGuard)
  @ApiOperation({ summary: 'Get current AI request count and limit for user' })
  @ApiOkResponse({
    description: 'AI request status',
    schema: {
      type: 'object',
      properties: {
        currentCount: { type: 'number' },
        maxLimit: { type: 'number' },
        remaining: { type: 'number' },
      },
    },
  })
  async getAiRequestStatus(@Request() req: AuthRequest) {
    const userId = req.user.userId || req.user.sub;
    const status = await this.aiRequestService.getAiRequestStatus(userId);
    return {
      code: 200,
      message: 'Success',
      data: status,
    };
  }
}


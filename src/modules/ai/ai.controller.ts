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
import { EvaluateChartDto } from "./dto/evaluate-chart.dto";
import { AuthRequest } from "@modules/auth/auth.controller";

@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiCleanJobService: AiCleanJobService,
    private readonly aiChartEvaluationService: AiChartEvaluationService,
    private readonly prismaService: PrismaService,
    private readonly datasetsService: DatasetsService
  ) {}

  @Post("chat-with-ai")
  @UseGuards(JwtAccessTokenGuard)
  @ApiBody({ type: ChatWithAiDto })
  @ApiOperation({ summary: 'Chat with AI assistant, auto-detect dataset requests' })
  async chatWithAi(@Body() body: ChatWithAiDto, @Req() req: any) {
    if (!body.message)
      throw new HttpException(
        "❌ Vui lòng gửi tin nhắn",
        HttpStatus.BAD_REQUEST
      );
    try {
      // Extract userId from JWT token (guaranteed by JwtAccessTokenGuard)
      const userId = req.user?.userId || req.user?.id;

      // Check if user is asking to create a chart
      const isChartRequest = this.isChartGenerationRequest(body.message);
      // Check if user wants to see dataset list
      const wantsDatasetList = this.isDatasetListRequest(body.message);

      // Debug log
      console.log("[DEBUG] Chat message:", body.message);
      console.log("[DEBUG] Is chart request:", isChartRequest);
      console.log("[DEBUG] Wants dataset list:", wantsDatasetList);
      console.log("[DEBUG] Has datasetId:", !!body.datasetId);
      console.log("[DEBUG] UserId:", userId);

      if (isChartRequest && body.datasetId && userId) {
        // User wants to create chart AND has dataset -> Generate directly
        console.log("[DEBUG] Route: Generate chart directly");
        const result = await this.handleChartGeneration(
          body.message,
          body.datasetId,
          userId
        );
        return { code: 200, message: 'Success', data: result };
      } else if (isChartRequest && userId) {
        console.log("[DEBUG] Route: Auto-fetch datasets for chart creation");
        const datasets = await this.getUserDatasets(userId);
        console.log("[DEBUG] Found datasets:", datasets.length);
        const result = await this.handleChartRequestWithoutDataset(body.message, datasets);
        return { code: 200, message: 'Success', data: result };
      } else if (wantsDatasetList && userId) {
        console.log("[DEBUG] Route: Show dataset list");
        const datasets = await this.getUserDatasets(userId);
        console.log("[DEBUG] Found datasets:", datasets.length);
        const result = await this.showDatasetList(datasets);
        return { code: 200, message: 'Success', data: result };
      }

      // Regular chat
      console.log("[DEBUG] Route: Regular chat");
      const result = await this.aiService.chatWithAi(
        body.message,
        body.messages,
        body.language
      );
      return { code: 200, message: 'Success', data: result };
    } catch (e: any) {
      throw new HttpException(
        { success: false, message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private isChartGenerationRequest(message: string): boolean {
    const lowerMsg = message.toLowerCase().trim();

    console.log("[DEBUG isChartGenerationRequest] Input message:", message);
    console.log("[DEBUG isChartGenerationRequest] Lowercased:", lowerMsg);

    // Positive keywords - intent to CREATE chart
    const createIntents = [
      "tạo biểu đồ",
      "tạo chart",
      "vẽ biểu đồ",
      "vẽ chart",
      "tạo một biểu đồ",
      "tạo một chart",
      "create chart",
      "generate chart",
      "make chart",
      "draw chart",
      "create a chart",
      "make a chart",
      "generate a chart",
      "draw a chart",
    ];

    // Check if message starts with create intent or contains it
    const hasCreateIntent = createIntents.some((intent) => {
      const matches = lowerMsg.includes(intent);
      if (matches) {
        console.log("[DEBUG isChartGenerationRequest] Matched intent:", intent);
      }
      return matches;
    });

    // Negative keywords - NOT a chart creation request
    const negativePatterns = [
      "là gì",
      "what is",
      "giải thích",
      "explain",
      "hướng dẫn",
      "guide",
      "cách",
      "how to",
      "thế nào",
      "?", // Questions typically not creation requests
    ];

    // If message is a question about charts, NOT a creation request
    const isQuestion = negativePatterns.some((pattern) => {
      const matches = lowerMsg.includes(pattern);
      if (matches) {
        console.log(
          "[DEBUG isChartGenerationRequest] Matched negative pattern:",
          pattern
        );
      }
      return matches;
    });

    const result = hasCreateIntent && !isQuestion;
    console.log(
      "[DEBUG isChartGenerationRequest] hasCreateIntent:",
      hasCreateIntent
    );
    console.log("[DEBUG isChartGenerationRequest] isQuestion:", isQuestion);
    console.log("[DEBUG isChartGenerationRequest] Final result:", result);

    return result;
  }

  private isDatasetListRequest(message: string): boolean {
    const lowerMsg = message.toLowerCase().trim();

    const listKeywords = [
      // Vietnamese dataset keywords
      "dataset đâu",
      "dataset nào",
      "có dataset",
      "dataset gì",
      "danh sách dataset",
      "xem dataset",
      "hiển thị dataset",
      "có những dataset",
      "các dataset",
      "dữ liệu nào",
      "xem dữ liệu",
      "có dữ liệu",
      "danh sách dữ liệu",
      "list",
      "danh sách",
      "show dataset",
      "list dataset",
      "my dataset",
      "available dataset",
      "show data",
      "list data",
      "my data",
      "what dataset",
      "which dataset",
      
      // Simple confirmations (when AI asks to show list)
      "yes",
      "ok",
      "okay",
      "có",
      "được",
      "list",
    ];

    return listKeywords.some((keyword) => lowerMsg.includes(keyword));
  }

  private async getUserDatasets(userId: string) {
    // Use DatasetsService to get user's datasets
    return await this.datasetsService.findAll(userId);
  }

  private async askForDatasetList() {
    return {
      reply: `📊 **Tạo biểu đồ từ dữ liệu**\n\n🤔 Tôi hiểu bạn muốn xem danh sách các dataset hiện có để lựa chọn.\n\n**Để xem và quản lý các dataset của bạn:**\n\n1️⃣ **Truy cập Dataset Management**\n   • Click vào mục "Data" hoặc "Datasets" trên thanh điều hướng\n   • Hoặc tìm menu "Manage Datasets"\n\n2️⃣ **Xem danh sách**\n   • Bảng sẽ hiển thị tất cả dataset bạn đã tải lên\n   • Thông tin: Tên, Số rows, Ngày tạo/cập nhật\n\n💡 **Mẹo:** Nếu chưa có dataset, click "Upload New Dataset" để thêm dữ liệu mới!\n\n---\n\n**Bạn có muốn tôi hiển thị danh sách dataset ngay đây không?**\n\n👉 Trả lời "Có" hoặc "List" để xem danh sách`,
      success: true,
      needsUserConfirmation: true,
      action: "list_datasets",
    };
  }

  private async showDatasetList(datasets: any[]) {
    if (datasets.length === 0) {
      return {
        reply:
          "**Bạn chưa có dataset nào!**\n\nĐể tạo biểu đồ, bạn cần có dataset trước. Hãy:\n1. Vào trang **Datasets**\n2. Click **Upload Dataset** để tải lên file dữ liệu\n3. Sau đó quay lại đây và chọn dataset để tạo biểu đồ\n\n💡 Hoặc bạn có thể dùng sample data có sẵn trong hệ thống!",
        success: true,
        needsDatasetSelection: true,
        datasets: [],
      };
    }

    return {
      reply: `📊 **Danh sách Dataset của bạn**\n\nBạn có ${datasets.length} dataset${datasets.length > 1 ? "s" : ""}:\n\n${datasets.map((d, i) => `${i + 1}. **${d.name}**${d.description ? ` - ${d.description}` : ""}\n   📈 ${d.rowCount} rows × ${d.columnCount} columns\n   🆔 ID: ${d.id}\n   📅 Cập nhật: ${new Date(d.updatedAt).toLocaleDateString("vi-VN")}`).join("\n\n")}\n\n---\n\n💡 **Cách tạo biểu đồ:**\n\nSau khi chọn dataset, hãy mô tả biểu đồ bạn muốn tạo, ví dụ:\n• "Tạo biểu đồ line chart hiển thị doanh thu theo tháng"\n• "Vẽ bar chart so sánh số lượng sản phẩm"\n\n👉 Khi bạn sẵn sàng, hãy chọn dataset và mô tả biểu đồ bạn muốn!`,
      success: true,
      needsDatasetSelection: true,
      datasets: datasets,
    };
  }

  private async handleChartRequestWithoutDataset(
    message: string,
    datasets: any[]
  ) {
    if (datasets.length === 0) {
      return {
        reply:
          "**Bạn chưa có dataset nào!**\n\nĐể tạo biểu đồ, bạn cần có dataset trước. Hãy:\n1. Vào trang **Datasets**\n2. Click **Upload Dataset** để tải lên file dữ liệu\n3. Sau đó quay lại đây và chọn dataset để tạo biểu đồ\n\n💡 Hoặc bạn có thể dùng sample data có sẵn trong hệ thống!",
        success: true,
        needsDatasetSelection: true,
        datasets: [],
      };
    }

    return {
      reply: `📊 **Chọn dataset để tạo biểu đồ**\n\nBạn có ${datasets.length} dataset${datasets.length > 1 ? "s" : ""}:\n\n${datasets.map((d, i) => `${i + 1}. **${d.name}**${d.description ? ` - ${d.description}` : ""}\n   📈 ${d.rowCount} rows × ${d.columnCount} columns`).join("\n\n")}\n\n💡 Vui lòng chọn dataset từ danh sách trên, sau đó mô tả chi tiết hơn về biểu đồ bạn muốn tạo!`,
      success: true,
      needsDatasetSelection: true,
      datasets: datasets,
    };
  }

  private async handleChartGeneration(
    message: string,
    datasetId: string,
    userId: string
  ) {
    try {
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
          reply: "❌ Dataset không tồn tại. Vui lòng chọn dataset hợp lệ.",
          success: false,
        };
      }

      if (dataset.userId !== userId) {
        return {
          reply: "❌ Bạn không có quyền truy cập dataset này.",
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
      });

      // Create chart in database with AI-generated config
      const createdChart = await this.prismaService.prisma.chart.create({
        data: {
          userId,
          datasetId,
          name: result.suggestedName,
          description: `AI-generated ${result.type} chart`,
          type: result.type,
          config: result.config,
        },
      });

      // Return chart URL for edit mode
      const chartUrl = `/chart-editor?chartId=${createdChart.id}`;

      return {
        reply: `✅ **Đã tạo biểu đồ thành công!**\n\n📊 **${result.suggestedName}**\n\n${result.explanation}\n\n🔗 [**Mở Chart Editor →**](${result.chartUrl})\n\n💡 Click vào link trên để xem và chỉnh sửa biểu đồ!`,
        success: true,
        chartGenerated: true,
        chartData: result,
      };
    } catch (error: any) {
      return {
        reply: `❌ Có lỗi khi tạo biểu đồ: ${error.message}\n\nVui lòng thử lại hoặc mô tả chi tiết hơn về biểu đồ bạn muốn.`,
        success: false,
      };
    }
  }

  // Clean raw CSV via AI
  @Post("clean")
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
  @ApiOperation({
    summary:
      "Clean data from an uploaded Excel/CSV file and return a 2D JSON array",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CleanExcelUploadDto })
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
}

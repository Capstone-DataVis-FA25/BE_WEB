import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EvaluateChartDto } from "./dto/evaluate-chart.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { KmsService } from "@modules/kms/kms.service";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class AiChartEvaluationService {
  private readonly logger = new Logger(AiChartEvaluationService.name);
  private readonly baseUrl = "https://openrouter.ai/api/v1";
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly kmsService: KmsService
  ) {
    this.apiKey = this.configService.get<string>("OPENROUTER_API_KEY") || "";
  }

  private getCommonHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer":
        this.configService.get<string>("CLIENT_URL") || "http://localhost:5173",
      "X-Title": "DataVis Chart Evaluator",
    };
  }

  private async postChat(body: any, tag?: string, maxAttempts: number = 3): Promise<any> {
    const url = `${this.baseUrl}/chat/completions`;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.getCommonHeaders(),
          body: JSON.stringify(body),
        });
        const text = await res.text().catch(() => "");
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { rawText: text };
        }

        if (res.ok) return data;

        // Retry on server errors and rate limits
        if (res.status >= 500 || res.status === 429) {
          const wait = Math.round(
            1000 * Math.pow(2, attempt - 1) + Math.random() * 200
          );
          this.logger.warn(
            `${tag ?? "postChat"} attempt ${attempt} got ${res.status}; retrying after ${wait}ms`
          );
          lastErr = new Error(`${res.status} ${res.statusText} - ${text}`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        this.logger.error(`${tag ?? "postChat"} failed: ${res.status} ${text}`);
        throw new InternalServerErrorException(`AI API error: ${res.status}`);
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          const wait = Math.round(
            1000 * Math.pow(2, attempt - 1) + Math.random() * 200
          );
          this.logger.warn(
            `${tag ?? "postChat"} error attempt ${attempt}: ${err?.message}; retrying in ${wait}ms`
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        this.logger.error(`${tag ?? "postChat"} fatal error: ${err?.message}`);
        throw new InternalServerErrorException(
          `AI request failed: ${err?.message}`
        );
      }
    }
    throw new InternalServerErrorException(
      `AI request failed after retries: ${lastErr?.message}`
    );
  }

  private extractAiContent(resData: any): string {
    if (!resData) return "";
    const choice = Array.isArray(resData.choices)
      ? resData.choices[0]
      : (resData.choice ?? null);
    const message = choice?.message ?? choice ?? null;

    let content = "";
    if (typeof message === "string") {
      content = message;
    } else if (message && typeof message === "object") {
      if (typeof message.content === "string" && message.content.trim()) {
        content = message.content;
      } else {
        try {
          content = JSON.stringify(message);
        } catch {
          content = String(message ?? "");
        }
      }
    } else {
      try {
        content = JSON.stringify(resData);
      } catch {
        content = String(resData ?? "");
      }
    }

    return (content || "").trim();
  }

  /**
   * Clean AI response by removing markdown code blocks
   */
  private cleanHtmlResponse(content: string): string {
    // Remove markdown code blocks (```html, ```, etc.)
    let cleaned = content.replace(/```html\s*/gi, "").replace(/```\s*/g, "");

    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Evaluate a chart using AI based on its image and dataset
   */
  async evaluateChart(dto: EvaluateChartDto, userId: string) {
    const start = Date.now();
    this.logger.log(
      `[evaluateChart] Starting evaluation for chart ${dto.chartId}`
    );

    if (!this.apiKey) {
      this.logger.error("OPENROUTER_API_KEY is not configured");
      throw new InternalServerErrorException("AI service is not configured");
    }

    // 1. Fetch chart with dataset
    const chart = await this.prismaService.prisma.chart.findUnique({
      where: { id: dto.chartId },
      include: {
        dataset: {
          include: {
            headers: {
              select: {
                name: true,
                type: true,
                index: true,
              },
            },
          },
        },
      },
    });

    if (!chart) {
      throw new NotFoundException("Chart not found");
    }

    if (chart.userId !== userId) {
      throw new BadRequestException(
        "You do not have permission to evaluate this chart"
      );
    }

    if (!chart.dataset) {
      throw new BadRequestException(
        "Chart does not have an associated dataset"
      );
    }

    // 2. Get dataset headers (names/types only, no row data)
    const decryptedHeaders = chart.dataset.headers
      .map((header: any) => ({
        name: header.name,
        type: header.type,
        index: header.index,
      }))
      .sort((a, b) => a.index - b.index);

    // 2.5. Get selected columns from request (sent by frontend) or default to all
    const selectedColumns =
      dto.selectedColumns && dto.selectedColumns.length > 0
        ? dto.selectedColumns
        : decryptedHeaders.map((h: any) => h.name);

    this.logger.debug(
      `[evaluateChart] Selected columns from frontend: ${selectedColumns.join(', ')}`
    );

    const datasetInfo = {
      totalRows: chart.dataset.rowCount,
      totalColumns: chart.dataset.columnCount,
      headers: decryptedHeaders.map((h) => ({ name: h.name, type: h.type })),
    };

    // 4. Build AI prompt
    const language = dto.language || "vi";

    // System prompt with evaluation criteria
    const systemPrompt = `You are an expert data analyst and data visualization specialist. Your job is to extract and explain insights directly from chart images and minimal dataset context.

  Core rules:
  - ONLY report numeric values that are visibly shown on the chart. If a number is not clearly visible, DO NOT invent or guess it—use relative comparisons instead (e.g., "largest", "about half", "roughly 3x").
  - Focus ONLY on deep data analysis: comparisons, gaps, rankings, distributions, trends, anomalies, segments (top/mid/low), and business meaning/actionables.
  - Include cross-series comparisons (e.g., Final vs Midterm vs Quiz across classes), using relative language when numbers are absent.
  - DO NOT evaluate chart suitability, aesthetics, or propose alternative visualizations.
  - If the image is unclear or not a valid chart, notify with an error.
  - Use structured HTML per user instructions.
  - Language: respond entirely in ${language}; no other language is allowed.
  `;

    // Build user prompt with dataset info (columns only) and selected columns
    const columnsList = datasetInfo.headers
      .map((h) => `${h.name} (${h.type})`)
      .join(", ");

    let userPrompt = `
  I have a chart visualizing specific columns from a dataset. Please perform a deep, geographic/demographic-style data analysis focusing ONLY on the data itself.

  <strong>Chart Context:</strong>
  - Chart Type: ${chart.type}
  - Columns selected for this chart: <strong>${selectedColumns.join(', ')}</strong>

  <strong>Dataset Information (no sample rows provided):</strong>
  - Total Rows: ${datasetInfo.totalRows}
  - Total Columns: ${datasetInfo.totalColumns}
  - All Available Columns: ${columnsList}

  <strong>MANDATORY - Detailed Data Analysis:</strong>
  - Read and list EVERY visible value/number from the chart image. If a number is not visible or unclear, DO NOT guess—describe RELATIVE sizes only (e.g., "largest", "about half", "roughly 3x").
  - List each category/label with its value if visible; otherwise note that the value is not labeled and provide a relative comparison.
  - Identify highest, lowest, middle ranges; quantify gaps, ratios, và shares only when numbers are visible. If not, provide relative gaps instead.
  - Provide statistical insights (total, average, median, mode, standard deviation, distribution shape, outliers) only when numbers are visible; if not, describe distribution patterns and relative concentrations without fabricating numbers.
  - Segment into tiers (top/mid/low performers) based on values or relative heights; mô tả sự tập trung/mật độ (ví dụ: "top tier chiếm X% tổng số" hoặc "các giá trị phân bố đều").
  - So sánh sát sao giữa các nhóm gần nhau (ví dụ: English vs Math), nêu rõ sự chênh lệch hoặc tương đồng.
  - Tính tỷ lệ phần trăm từng nhóm/môn so với tổng (nếu có số), hoặc mô tả tỷ trọng tương đối.
  - Nhận diện outlier (giá trị vượt trội hoặc thấp bất thường) và giải thích ý nghĩa.
  - Đưa ra nhận định về xu hướng (ví dụ: nhóm môn nghệ thuật có xu hướng cao hơn các môn khác, hay các giá trị đang tăng/giảm).
  - So sánh chéo series (Final/Midterm/Quiz) giữa các lớp, dùng số khi có, nếu không thì mô tả tương đối.
  - Đưa ra nhận định kinh doanh, ý nghĩa thực tiễn và hành động gợi ý: ai/nhóm nào cần chú ý, nên làm gì để cải thiện, đề xuất hoạt động cụ thể (ví dụ: tổ chức workshop, khảo sát lý do, tăng cường truyền thông, đổi mới phương pháp...).

  Return the analysis in clean HTML following the formatting rules below.
  `;

    const requiredSections =
      language === "vi"
        ? ["Phân tích dữ liệu chi tiết"]
        : ["Detailed Data Analysis"];

    userPrompt += `
Please analyze the chart image and dataset following this structure:

<strong>MANDATORY SECTION - Detailed Data Analysis:</strong>
- Read and report values (or relative sizes if unlabeled)
- Identify highest, lowest, gaps, and distribution
- Provide patterns, trends, segments, and business meaning

<strong>HTML Formatting Requirements:</strong>
- <h2> for section titles with style="color: #2563eb; font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem;"
- <p> for paragraphs with style="margin-bottom: 0.75rem; line-height: 1.6; color: #fffff;"
- <ul> with style="list-style-type: disc; margin-left: 1.5rem; margin-bottom: 0.75rem; padding-left: 1rem;"
- <li> with style="margin-bottom: 0.5rem; line-height: 1.6; display: list-item; color: #fffff;"
- <strong> for emphasis and numbers with style="color: #fffff; font-weight: 600;"
- Use <code> tags for specific values: <code style="background: #1f2937; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #fffff;">value</code>

<strong>Required Section (use this as the single h2 header):</strong>
${requiredSections.join("\n")}

Return ONLY clean HTML content without markdown code blocks or backticks.
Important: You MUST answer entirely in the following language, with no exceptions: ${language}.  
Your entire response must be written 100% in ${language}, and you are NOT allowed to use any other language.
`;

    // 5. Call OpenRouter API with vision
    const modelMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
          },
          {
            type: "image_url",
            image_url: {
              url: dto.chartImage,
            },
          },
        ],
      },
    ];

    this.logger.debug(`[evaluateChart] User prompt: ${userPrompt}`);

    const body = {
       messages: modelMessages,
      temperature: 0.7,
      max_tokens: 3000, // Increased for comprehensive analysis
    };

    this.logger.log(
      `[evaluateChart] Calling OpenRouter API with vision model...`
    );
    const resData = await this.postChat(body, "evaluateChart");

    // 6. Extract and clean response
    const rawContent = this.extractAiContent(resData);
    const content = this.cleanHtmlResponse(rawContent);
    const elapsed = Date.now() - start;

    this.logger.log(`[evaluateChart] Completed in ${elapsed}ms`);

    return {
      success: true,
      evaluation: content,
      chartInfo: {
        id: chart.id,
        name: chart.name,
        type: chart.type,
      },
      selectedColumns,
      processingTime: elapsed,
    };
  }

  /**
   * Analyze forecast chart image using Gemini AI
   * @param forecastId Forecast ID
   * @param chartImageUrl Chart image URL path (e.g., /uploads/forecasts/forecast-xxx.png)
   * @returns Analysis text
   */
  async analyzeForecastChart(
    forecastId: string,
    chartImageUrl: string,
    maxAttempts: number = 3,
  ): Promise<string | null> {
    const start = Date.now();
    this.logger.log(
      `[analyzeForecastChart] Starting analysis for forecast ${forecastId}`
    );

    if (!this.apiKey) {
      this.logger.warn("OPENROUTER_API_KEY is not configured, skipping analysis");
      return null;
    }

    try {
      // Remove leading slash and resolve path
      const imagePath = chartImageUrl.startsWith('/')
        ? chartImageUrl.substring(1)
        : chartImageUrl;

      // Resolve project root using process.cwd() - same as ai.service.ts
      // This ensures consistency with where the image was saved
      // Use process.cwd() so it works the same in dev and after build,
      // assuming the Nest app is started from the BE_WEB project root.
      const projectRoot = process.cwd();

      const fullImagePath = path.join(projectRoot, 'public', imagePath);

      this.logger.log(`[analyzeForecastChart] Looking for image at: ${fullImagePath}`);
      this.logger.log(`[analyzeForecastChart] Image exists: ${fs.existsSync(fullImagePath)}`);

      if (!fs.existsSync(fullImagePath)) {
        this.logger.warn(`[analyzeForecastChart] Image not found at: ${fullImagePath}`);
        this.logger.warn(`[analyzeForecastChart] Chart image URL: ${chartImageUrl}`);
        return null;
      }

      // Read image file and convert to base64
      const imageBuffer = fs.readFileSync(fullImagePath);
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${base64Image}`;

      this.logger.log(`[analyzeForecastChart] Image loaded, size: ${imageBuffer.length} bytes`);
      this.logger.log(`[analyzeForecastChart] Base64 length: ${base64Image.length} chars`);

      // Fetch forecast with dataset information to get context
      const forecast = await this.prismaService.prisma.forecast.findUnique({
        where: { id: forecastId },
        include: {
          dataset: {
            select: {
              id: true,
              name: true,
              headers: true, // Include headers to get available columns
            },
          },
        },
      });

      const targetColumn = forecast?.targetColumn || 'the metric';
      const forecastName = forecast?.name || null;
      const datasetName = forecast?.dataset?.name || null;

      // Get performance metrics
      const metrics = forecast?.metrics as any;
      const testR2 = metrics?.testR2;
      const testRMSE = metrics?.testRMSE;
      const testMAE = metrics?.testMAE;
      const testMAPE = metrics?.testMAPE;

      // Get available columns from dataset headers
      const availableColumns: string[] = [];
      if (forecast?.dataset?.headers) {
        // Headers are already decrypted by PrismaService extension
        const headers = forecast.dataset.headers as any[];
        availableColumns.push(...headers.map((h: any) => h.name));
      }

      // Filter out time-related columns and the target column to suggest alternatives
      const timeKeywords = ['year', 'month', 'day', 'date', 'time', 'timestamp', 'week'];
      const numericColumns = availableColumns.filter(col => {
        const header = (forecast?.dataset?.headers as any[])?.find((h: any) => h.name === col);
        return header?.type === 'number' || header?.type === 'integer' || header?.type === 'float';
      });
      const alternativeColumns = numericColumns.filter(
        col => col !== targetColumn && !timeKeywords.some(keyword => col.toLowerCase().includes(keyword))
      );

      // Detect if forecasting a nonsensical column (time/date columns)
      const isTimeColumn = timeKeywords.some(keyword =>
        targetColumn.toLowerCase().includes(keyword)
      );

      // Build AI prompt for forecast analysis, written for normal business users
      const systemPrompt = `You are an expert business data analyst.
You are helping a non-technical user understand a forecast chart.

Your job is to write a clear, natural paragraph that jumps straight into INSIGHTS - no redundant descriptions of what the chart is. The user already knows it's a forecast chart.

Start immediately with:
- Key observations: highest/lowest values, notable peaks or drops, overall trends (increasing/decreasing/stable)
- Patterns: seasonal patterns, cycles, volatility, stability
- Future predictions: what the forecast shows (direction, magnitude, uncertainty)
- Prediction reliability: based on model performance metrics (R², RMSE, MAE, MAPE), assess whether users should trust these predictions and how confident they should be
- Context: what this means for the business/user (why it matters)
- Concerns: any issues, risks, or things to watch out for
- Actions: what the user should do based on this forecast

CRITICAL VALIDATION:
If the forecast is trying to predict a TIME/DATE column (like "Year", "Month", "Date", "Time"), this DOES NOT MAKE SENSE. Time columns are typically used as the X-axis (time dimension), not as something to predict. In this case, you MUST clearly explain that forecasting a time/date column is not meaningful and suggest forecasting a MEASUREMENT/VALUE column instead. When making recommendations, use the ACTUAL COLUMN NAMES from the dataset context provided - be specific and reference the actual columns available in their dataset.

VERY IMPORTANT RULES:
- Write for NORMAL BUSINESS USERS, not data scientists.
- Use clear, simple language and avoid technical terms (no "confidence interval", "overfitting", etc.).
- When interpreting performance metrics:
  * R²: Explain in simple terms (e.g., "The model explains about X% of the variation in the data" or "The predictions are fairly reliable" vs "The predictions have significant uncertainty")
  * R² > 0.7: Strong/very reliable predictions
  * R² 0.5-0.7: Moderate reliability, predictions are somewhat trustworthy but have notable uncertainty
  * R² < 0.5: Low reliability, predictions should be used with caution
  * RMSE/MAE: Explain in terms of typical error size relative to the values being predicted
  * MAPE: Explain as average percentage error (e.g., "predictions are typically off by about X%")
- Always provide guidance on whether users should trust these predictions based on the metrics.
- Write as a SINGLE, FLOWING PARAGRAPH (not bullet points or sections). Make it read naturally, like you're explaining to a colleague.
- DO NOT start with "This chart shows..." or "The chart displays..." - jump straight into insights. The user already knows what a forecast chart is.
- DO NOT describe what the chart is - focus on what the data TELLS US.
- Keep it CONCISE: If the forecast is simple or doesn't have much to say, keep it short. Don't pad it with repetition.
- Focus ONLY on what the data and predictions say about the real-world topic (e.g. sales, traffic, temperature), not on the model or algorithms.
- Do NOT mention the model type, model performance, accuracy metrics, loss functions, or any technical details.
- Be concrete and practical: specific values, clear trends, actionable insights.
- AVOID REPETITION: Don't say the same thing multiple times. Each sentence should add new information.

You MUST provide the analysis in BOTH English and Vietnamese. Format your response EXACTLY as follows (return ONLY the paragraphs, no other text):

---ENGLISH---
[Write a single, natural paragraph in English that flows well and covers all the important points concisely]

---VIETNAMESE---
[Viết một đoạn văn tự nhiên bằng tiếng Việt, trình bày mạch lạc và bao quát tất cả các điểm quan trọng một cách ngắn gọn]

Return ONLY these two paragraphs with the exact headers shown above. Do not add any introductory text, conclusions, or additional commentary outside of these paragraphs.`;

      // Build context information
      let contextInfo = `Target column being forecasted: "${targetColumn}".`;
      if (forecastName) {
        contextInfo = `Forecast name: "${forecastName}". ${contextInfo}`;
      }
      if (datasetName) {
        contextInfo += ` Dataset: "${datasetName}".`;
      }
      if (availableColumns.length > 0) {
        contextInfo += ` Available columns in dataset: ${availableColumns.join(', ')}.`;
      }

      // Add performance metrics to context
      let metricsInfo = '';
      if (testR2 !== undefined && testR2 !== null) {
        metricsInfo = `\n\nModel Performance Metrics:\n`;
        metricsInfo += `- Test R²: ${testR2.toFixed(3)} (measures how well the model explains the data, higher is better, max is 1.0)\n`;
        if (testRMSE !== undefined && testRMSE !== null) {
          metricsInfo += `- Test RMSE: ${testRMSE.toFixed(3)} (average prediction error)\n`;
        }
        if (testMAE !== undefined && testMAE !== null) {
          metricsInfo += `- Test MAE: ${testMAE.toFixed(3)} (average absolute error)\n`;
        }
        if (testMAPE !== undefined && testMAPE !== null) {
          metricsInfo += `- Test MAPE: ${testMAPE.toFixed(2)}% (average percentage error)`;
        }
      }

      const validationWarning = isTimeColumn
        ? `\n\n⚠️ IMPORTANT: The target column "${targetColumn}" appears to be a TIME/DATE column. Forecasting time/date columns typically doesn't make business sense - you should forecast MEASUREMENT/VALUE columns instead.`
        : '';

      // Add specific alternative column suggestions if forecasting a time column
      const alternativeSuggestions = isTimeColumn && alternativeColumns.length > 0
        ? `\n\n💡 SUGGESTION: Based on the dataset columns, consider forecasting one of these numeric columns instead: ${alternativeColumns.slice(0, 5).join(', ')}.`
        : '';

      const userPrompt = `Analyze this forecast chart and provide insights.

Context: ${contextInfo}${metricsInfo}${validationWarning}${alternativeSuggestions}

Write a single, natural paragraph that jumps STRAIGHT INTO INSIGHTS. Do NOT describe what the chart is - the user already knows it's a forecast chart.

Focus on:
- Key observations: highest/lowest values, peaks, drops, overall trend direction
- Patterns: seasonal cycles, volatility, stability
- Future outlook: what the forecast predicts (direction, magnitude, uncertainty ranges)
- Prediction reliability: Based on the performance metrics provided, assess how trustworthy these predictions are and whether users should rely on them for decision-making
- Business context: what this means and why it matters
- Concerns: any issues or risks to watch
- Actions: what to do based on this forecast (considering the reliability level)

IMPORTANT FOR RECOMMENDATIONS:
- When suggesting alternative columns to forecast, use the ACTUAL COLUMN NAMES from the dataset context above
- Be specific: reference the exact column names available in their dataset (e.g., "Consider forecasting the 'Sales' column instead" not just "consider forecasting sales")
- If forecasting a time column, suggest specific numeric columns from their dataset that would be more meaningful to forecast
- Make recommendations relevant to their actual data, not generic suggestions

CRITICAL: Start immediately with insights. Do NOT begin with "This chart shows..." or "The chart displays..." - jump straight into what the data tells us (e.g., "Temperatures range from X to Y, with a slight downward trend...").

Keep it concise, natural, and actionable. Avoid repetition and technical jargon.
Return your answer in BOTH English and Vietnamese, using EXACTLY the paragraph format described in the system prompt.`;

      // Call OpenRouter API with GPT‑4o vision model for forecast analysis
      const modelMessages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ];

      const body = {
        model: "openai/gpt-4o", // Use GPT-4o vision model for forecast analysis
        messages: modelMessages,
        temperature: 0.7,
        max_tokens: 3000, // Increased for bilingual content (English + Vietnamese)
      };

      this.logger.log(
        `[analyzeForecastChart] Calling OpenRouter API with vision model: ${body.model}`
      );
      this.logger.log(
        `[analyzeForecastChart] Sending image (base64 length: ${imageDataUrl.length}) and prompt to model...`
      );
      this.logger.log(
        `[analyzeForecastChart] Max attempts: ${maxAttempts}`
      );

      const resData = await this.postChat(body, "analyzeForecastChart", maxAttempts);

      // Extract and clean response
      const rawContent = this.extractAiContent(resData);
      const cleanedContent = rawContent.trim();
      const elapsed = Date.now() - start;

      this.logger.log(`[analyzeForecastChart] Completed in ${elapsed}ms`);
      this.logger.log(`[analyzeForecastChart] Analysis length: ${cleanedContent.length} chars`);
      this.logger.debug(`[analyzeForecastChart] Analysis preview: ${cleanedContent.substring(0, 200)}...`);

      if (!cleanedContent || cleanedContent.length === 0) {
        this.logger.warn(`[analyzeForecastChart] Received empty analysis from Gemini`);
        return null;
      }

      // Return the full bilingual response (will be parsed by frontend based on language)
      // Format: ---ENGLISH---\n[english text]\n---VIETNAMESE---\n[vietnamese text]
      return cleanedContent;
    } catch (error: any) {
      this.logger.error(
        `[analyzeForecastChart] Error analyzing forecast: ${error.message}`
      );
      // Don't throw - return null so forecast creation can still succeed
      return null;
    }
  }
}

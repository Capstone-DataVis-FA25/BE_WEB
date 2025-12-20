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

      // Build AI prompt for forecast analysis, written for normal business users
      const systemPrompt = `You are an expert business data analyst helping non-technical users understand forecast charts.

Your job is to write a clear, structured analysis that is easy to understand. The user already knows it's a forecast chart, so focus on insights, not descriptions.

VERY IMPORTANT RULES:
- Write for NORMAL BUSINESS USERS, not data scientists.
- Use clear, simple language and avoid ALL technical terms (no "R²", "RMSE", "MAE", "MAPE", "confidence interval", "overfitting", "model performance", etc.).
- NEVER mention specific metric values or technical model details to the user.
- Base your judgments on the performance metrics provided in the context, but translate them into plain language:
  * R² > 0.7: "very reliable" or "highly trustworthy" predictions
  * R² 0.5-0.7: "moderately reliable" or "somewhat trustworthy" predictions with "notable uncertainty"
  * R² < 0.5: "low reliability" or "should be used with caution" - predictions have "significant uncertainty"
  * High RMSE/MAE relative to values: "predictions may have large errors" or "significant prediction errors"
  * High MAPE: "predictions are typically off by a large margin" or "high percentage error"
- DO NOT show numbers like "R² of -0.172" or "RMSE of 233.949" - instead say "low reliability" or "significant prediction errors".
- Focus ONLY on what the data and predictions say about the real-world topic (e.g. sales, traffic, temperature), not on the model or algorithms.
- CRITICAL: You MUST extract and mention SPECIFIC STATISTICS from the chart image:
  * Actual values: specific numbers, ranges, peaks, lows from the historical data
  * Historical patterns: mention actual time periods, specific values at different points
  * Forecast values: specific predicted numbers, ranges, and changes
  * Comparisons: "increased from X to Y", "peaked at Z", "ranges between A and B"
  * Percentage changes: "increased by X%", "decreased by Y%"
- AVOID generic statements that could apply to any forecast. Every statement should be specific to THIS forecast's actual data.
- Be concrete and practical: use actual numbers from the chart, describe specific trends and patterns visible in the data.
- Explain WHY the forecast predicts what it does based on the actual historical patterns you see in the chart.
- Keep each section concise but detailed with specific statistics.

You MUST provide the analysis in BOTH English and Vietnamese. Format your response EXACTLY as follows with these clear sections:

---ENGLISH---
Summary
[Describe the overall trend in the historical data with SPECIFIC STATISTICS from the chart. Include actual values, ranges, peaks, lows, and time periods. For example: "The historical data shows values ranging from X to Y, with a peak of Z in [time period] and a low of W in [time period]." Mention if it's increasing, decreasing, or stable, and include specific numbers to support your description. Keep it detailed and data-driven.]

Future Outlook
[Describe what the forecast predicts with SPECIFIC NUMBERS and VALUES from the chart. Include actual predicted values, ranges, and changes. For example: "The forecast predicts values will [increase/decrease] from [current value] to [predicted value] over the next [time period], representing a [X%] change." Explain WHY the forecast predicts this based on the historical patterns you observe in the chart. Based on the model performance metrics (which you have access to but should NOT mention by name), incorporate reliability assessment naturally - if predictions are unreliable, mention it here (e.g., "these predictions should be used with caution" or "the forecast shows significant uncertainty"). Keep it specific to the actual forecast values shown.]

Key Takeaways
[Provide 2-4 clear, SPECIFIC bullet points that are unique to THIS forecast's actual data. Each point should reference specific values, patterns, or predictions from the chart. Avoid generic advice that could apply to any forecast. For example:
- "Values are expected to [specific change] from [specific number] to [specific number], which is [specific context/reason]"
- "The historical pattern shows [specific pattern with numbers], suggesting [specific insight]"
- "Based on the [specific historical behavior], users should [specific action related to this forecast's data]"
Make each point actionable and specific to the actual forecast data shown.]

---VIETNAMESE---
Tóm tắt
[Mô tả xu hướng tổng thể trong dữ liệu lịch sử với CÁC THỐNG KÊ CỤ THỂ từ biểu đồ. Bao gồm các giá trị thực tế, phạm vi, đỉnh, đáy và khoảng thời gian. Ví dụ: "Dữ liệu lịch sử cho thấy các giá trị dao động từ X đến Y, với đỉnh Z vào [khoảng thời gian] và đáy W vào [khoảng thời gian]." Đề cập nếu nó đang tăng, giảm hoặc ổn định, và bao gồm các con số cụ thể để hỗ trợ mô tả của bạn. Giữ chi tiết và dựa trên dữ liệu.]

Triển vọng tương lai
[Mô tả những gì dự báo dự đoán với CÁC SỐ VÀ GIÁ TRỊ CỤ THỂ từ biểu đồ. Bao gồm các giá trị dự đoán thực tế, phạm vi và thay đổi. Ví dụ: "Dự báo dự đoán các giá trị sẽ [tăng/giảm] từ [giá trị hiện tại] đến [giá trị dự đoán] trong [khoảng thời gian] tiếp theo, đại diện cho thay đổi [X%]." Giải thích TẠI SAO dự báo dự đoán điều này dựa trên các mẫu lịch sử bạn quan sát trong biểu đồ. Dựa trên các chỉ số hiệu suất mô hình (mà bạn có quyền truy cập nhưng KHÔNG nên đề cập tên), kết hợp đánh giá độ tin cậy một cách tự nhiên - nếu các dự đoán không đáng tin cậy, hãy đề cập ở đây (ví dụ: "các dự đoán này nên được sử dụng thận trọng" hoặc "dự báo cho thấy độ không chắc chắn đáng kể"). Giữ cụ thể cho các giá trị dự báo thực tế được hiển thị.]

Điểm chính
[Đưa ra 2-4 điểm rõ ràng, CỤ THỂ duy nhất cho dữ liệu thực tế của DỰ BÁO NÀY. Mỗi điểm nên tham chiếu các giá trị, mẫu hoặc dự đoán cụ thể từ biểu đồ. Tránh lời khuyên chung chung có thể áp dụng cho bất kỳ dự báo nào. Ví dụ:
- "Các giá trị dự kiến sẽ [thay đổi cụ thể] từ [số cụ thể] đến [số cụ thể], điều này là [ngữ cảnh/lý do cụ thể]"
- "Mẫu lịch sử cho thấy [mẫu cụ thể với số liệu], gợi ý [thông tin chi tiết cụ thể]"
- "Dựa trên [hành vi lịch sử cụ thể], người dùng nên [hành động cụ thể liên quan đến dữ liệu dự báo này]"
Làm cho mỗi điểm có thể hành động và cụ thể cho dữ liệu dự báo thực tế được hiển thị.]

Return ONLY these sections with the exact headers shown above. Do not add any introductory text, conclusions, or additional commentary outside of these sections.`;

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

      // Add performance metrics to context (for AI to judge, but NOT to show to users)
      let metricsInfo = '';
      if (testR2 !== undefined && testR2 !== null) {
        metricsInfo = `\n\n[INTERNAL - DO NOT MENTION THESE METRICS TO THE USER] Model Performance Metrics for your analysis:\n`;
        metricsInfo += `- Test R²: ${testR2.toFixed(3)} (measures how well the model explains the data, higher is better, max is 1.0)\n`;
        if (testRMSE !== undefined && testRMSE !== null) {
          metricsInfo += `- Test RMSE: ${testRMSE.toFixed(3)} (average prediction error)\n`;
        }
        if (testMAE !== undefined && testMAE !== null) {
          metricsInfo += `- Test MAE: ${testMAE.toFixed(3)} (average absolute error)\n`;
        }
        if (testMAPE !== undefined && testMAPE !== null) {
          metricsInfo += `- Test MAPE: ${testMAPE.toFixed(2)}% (average percentage error)\n`;
        }
        metricsInfo += `Use these metrics to assess reliability, but translate your assessment into plain language. NEVER mention the actual metric names or values in your response.`;
      }

      const userPrompt = `Analyze this forecast chart and provide insights in the structured format specified.

Context: ${contextInfo}${metricsInfo}

CRITICAL INSTRUCTIONS:
1. Look carefully at the chart image and extract SPECIFIC STATISTICS:
   - Actual historical values (numbers, ranges, peaks, lows)
   - Specific time periods and dates
   - Forecasted values and predicted ranges
   - Percentage changes and comparisons
   - Any visible patterns, cycles, or anomalies

2. Summary Section:
   - Include actual numbers from the historical data (e.g., "ranging from 50 to 200", "peaked at 180 in Q2 2023")
   - Mention specific time periods where notable changes occurred
   - Describe the overall trend with supporting statistics

3. Future Outlook Section:
   - Include specific predicted values from the forecast (e.g., "expected to reach 150 by [date]", "will decrease by approximately 20%")
   - Explain WHY the forecast predicts this based on the historical patterns visible in the chart
   - Incorporate reliability assessment naturally based on the performance metrics (translate into plain language, never mention metric names or values)

4. Key Takeaways Section:
   - Each point MUST be specific to THIS forecast's actual data
   - Reference specific values, patterns, or predictions from the chart
   - Avoid generic statements like "monitor closely" or "use with caution" without context
   - Make each point actionable and unique to this particular forecast

IMPORTANT:
- Base your reliability assessment on the performance metrics provided, but describe it in plain language (e.g., "predictions should be used with caution" instead of "R² is -0.172")
- Every statement should include specific statistics or values from the chart
- Avoid generic advice that could apply to any forecast
- Explain the reasoning behind predictions based on actual historical patterns
- Keep each section detailed with specific numbers and data points

Return your answer in BOTH English and Vietnamese, using EXACTLY the structured format with section headers as described in the system prompt.`;

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

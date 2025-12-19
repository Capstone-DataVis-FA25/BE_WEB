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

      // Resolve project root using the same method as ai.service.ts
      // This ensures consistency with where the image was saved
      const isProduction = __dirname.includes('dist');

      // Get the script directory path (same as ai.service.ts)
      const baseDir = isProduction
        ? path.join(__dirname, '..', '..', '..', 'src', 'modules', 'ai')
        : __dirname;

      // Construct the script path to get the script directory
      const scriptPath = path.join(baseDir, 'ai-model', 'AI_Training.py');
      const scriptDir = path.dirname(scriptPath);

      // From scriptDir (src/modules/ai/ai-model), go up 4 levels to get to BE_WEB root
      // ai-model -> ai -> modules -> src -> BE_WEB
      const projectRoot = path.resolve(scriptDir, '..', '..', '..', '..');

      const fullImagePath = path.join(projectRoot, 'public', imagePath);

      this.logger.log(`[analyzeForecastChart] Resolved project root: ${projectRoot}`);
      this.logger.log(`[analyzeForecastChart] Script dir: ${scriptDir}`);

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

      // Build AI prompt for forecast analysis
      const systemPrompt = `You are an expert data analyst specializing in time series forecasting and prediction analysis. 
Analyze the forecast chart image provided and provide insights about the DATA and PREDICTIONS ONLY. Do NOT comment on the model itself, model performance, or technical aspects of the forecasting method.

Focus your analysis on:

1. **Trend Analysis**: 
   - What trends do you observe in the historical data?
   - How does the forecast trend compare to historical patterns?
   - Are there any significant changes or anomalies in the data?

2. **Forecast Quality Assessment**:
   - Does the forecast appear reasonable based on historical data patterns?
   - Are there any concerning patterns or unexpected predictions in the forecasted values?
   - What does the confidence interval tell us about prediction uncertainty?

3. **Key Insights**:
   - What are the main takeaways from this forecast?
   - What should decision-makers pay attention to?
   - Are there any actionable recommendations based on the predictions?

4. **Potential Concerns**:
   - Are there any red flags or areas of uncertainty in the predictions?
   - What factors might affect the accuracy of these predictions?

CRITICAL: 
- Focus ONLY on the topic being forecasted and the predictions themselves
- Do NOT mention the model type, model performance, overfitting, or technical model details
- Do NOT comment on whether the model is good or bad
- Focus on what the data and predictions tell us about the business/topic

IMPORTANT: You must provide the analysis in BOTH English and Vietnamese. Format your response EXACTLY as follows (return ONLY the sections, no other text):

---ENGLISH---
1. Trend Analysis

[Your trend analysis in English here]

2. Forecast Quality Assessment

[Your quality assessment in English here]

3. Key Insights

[Your key insights in English here]

4. Potential Concerns

[Your concerns in English here]

5. Actionable Recommendations

[Your recommendations in English here]

---VIETNAMESE---
1. Phân tích xu hướng

[Phân tích xu hướng của bạn bằng tiếng Việt ở đây]

2. Đánh giá chất lượng dự báo

[Đánh giá chất lượng của bạn bằng tiếng Việt ở đây]

3. Những hiểu biết chính

[Những hiểu biết chính của bạn bằng tiếng Việt ở đây]

4. Những lo ngại tiềm ẩn

[Những lo ngại của bạn bằng tiếng Việt ở đây]

5. Đề xuất hành động

[Đề xuất của bạn bằng tiếng Việt ở đây]

Return ONLY these sections with the exact section headers shown above. Do not add any introductory text, conclusions, or additional commentary outside of these sections.`;

      const userPrompt = `Please analyze this forecast chart image. The chart shows historical data and future predictions. 
Provide a comprehensive analysis in BOTH English and Vietnamese, separated by the markers ---ENGLISH--- and ---VIETNAMESE---.
Focus ONLY on the topic being forecasted and the predictions themselves. Do NOT comment on the model, model performance, or technical aspects.
Return ONLY the 5 sections listed in the system prompt with the exact section headers.`;

      // Call OpenRouter API with Gemini vision model
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
        model: "google/gemini-2.0-flash-exp:free", // Use Gemini 2.0 Flash (free tier, supports vision)
        messages: modelMessages,
        temperature: 0.7,
        max_tokens: 3000, // Increased for bilingual content (English + Vietnamese)
      };

      this.logger.log(
        `[analyzeForecastChart] Calling OpenRouter API with Gemini model: ${body.model}`
      );
      this.logger.log(
        `[analyzeForecastChart] Sending image (base64 length: ${imageDataUrl.length}) and prompt to Gemini...`
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

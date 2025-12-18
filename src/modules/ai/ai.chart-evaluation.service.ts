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
            headers: true,
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

    // 2. Get dataset headers (already decrypted by PrismaService extension)
    const decryptedHeaders = chart.dataset.headers
      .map((header: any) => ({
        name: header.name,
        type: header.type,
        index: header.index,
        data: header.data || [],
      }))
      .sort((a, b) => a.index - b.index);

    // 2.5. Get selected columns from request (sent by frontend)
    const selectedColumns = dto.selectedColumns || [];

    console.log('selectedColumns: ', selectedColumns);

    this.logger.debug(`[evaluateChart] Selected columns from frontend: ${selectedColumns.join(', ')}`);

    // 3. Build dataset sample (first 50 rows for context)
    const sampleSize = Math.min(50, decryptedHeaders[0]?.data?.length || 0);
    const datasetSample: any[][] = [];

    // Add header row
    datasetSample.push(decryptedHeaders.map((h) => h.name));

    // Add data rows
    for (let i = 0; i < sampleSize; i++) {
      const row = decryptedHeaders.map((h) => h.data[i]);
      datasetSample.push(row);
    }

    const datasetInfo = {
      totalRows: chart.dataset.rowCount,
      totalColumns: chart.dataset.columnCount,
      headers: decryptedHeaders.map((h) => ({ name: h.name, type: h.type })),
      sampleData: datasetSample,
    };

    // 4. Build AI prompt
    const language = dto.language || "vi";

    // System prompt with evaluation criteria
    const systemPrompt = `You are an expert data visualization and data analysis specialist. You will evaluate charts with a focus on:
1. **Detailed data analysis from the chart image**: Read and interpret the actual values, bars, lines, or segments visible in the chart
2. Data visualization best practices and chart type appropriateness
3. Statistical insights: comparisons, rankings, trends, and patterns
4. Color scheme, aesthetics, clarity and readability
5. Accuracy of data representation and accessibility

When analyzing a chart image and dataset, please provide:

1. **Detailed Data Analysis from Chart Image**:
IMPORTANT: You MUST read and report the actual numeric values visible in the chart image.
- What type of chart is this? (bar chart, line chart, pie chart, scatter plot, etc.)
- List the EXACT categories/labels shown on the axes or legend
- For EACH category/data point visible in the chart:
  * State the SPECIFIC numeric value or approximate value you can see
  * Example: "Platform A shows 45,000 revenue, Platform B shows 32,000 revenue, Platform C shows 28,000 revenue"
  * For bar charts: read the height/length of each bar and state its value
  * For line charts: identify key data points with their coordinates
  * For pie charts: state the percentage or value of each slice
- Provide data comparisons:
  * Which category has the HIGHEST value? State the exact number
  * Which category has the LOWEST value? State the exact number
  * Calculate the difference or ratio between highest and lowest
  * Identify any categories in the middle range
  * Are there significant gaps between consecutive values?
- Statistical summary:
  * Approximate total/sum if applicable
  * Average/mean value across categories
  * Identify any outliers (values significantly higher or lower than others)
  * Describe the overall distribution pattern (even, skewed, clustered, etc.)
- Trends and patterns:
  * Is there an increasing/decreasing trend?
  * Are there any notable peaks, valleys, or inflection points?
  * Any seasonal or cyclical patterns visible?
- Business insights:
  * What business story does this data tell?
  * What decisions or actions might these numbers suggest?

2. Evaluate the suitability of the chart with the dataset:
- Is this chart appropriate for the data type?
- Does the chart help convey information most intuitively?

3. Suggest alternative or complementary chart types (if more suitable):
- If the chart is not suitable, suggest better chart alternatives.
- If complementary charts are needed, propose supplementary chart types or components.

4. Suggest advanced enhancements for the chart:
- What can be added/highlighted/emphasized to make the chart more intuitive (e.g., highlights, labels, grouping, filters, colors, annotations, trend lines, etc.)?
- What insights or statistical information should be added to the chart?

5. General improvement suggestions or deeper insights if any:
- What additional metrics, groups, or data components should be analyzed based on the dataset?

6. Propose additional visualization directions:
- Suggest other visualization formats (dashboards, combined charts, small multiples, heatmaps, maps, distribution plots, etc.) that can further reveal insights.
- Recommend multi-chart layouts or storytelling flows to enhance analysis.
- Propose interactive visualization ideas (filters, drill-down, tooltips, segmented views).

Note: If the image is unclear or not a valid chart image, notify the user with an error message.

Provide constructive feedback and specific recommendations for improvement.
Important: You MUST answer entirely in the following language, with no exceptions: ${language}.  
Your entire response must be written 100% in ${language}, and you are NOT allowed to use any other language.
`;

    // Build user prompt with dataset info and questions
    let userPrompt = `
I have a chart visualizing specific columns from a dataset. Please analyze it carefully.

<strong>Chart Configuration:</strong>
- Chart Type: ${chart.type}
${selectedColumns.length > 0 ? `- Selected Columns Being Visualized: <strong>${selectedColumns.join(', ')}</strong>` : ''}

<strong>Dataset Information:</strong>
- Total Rows: ${datasetInfo.totalRows}
- Total Columns: ${datasetInfo.totalColumns}
- All Available Columns: ${datasetInfo.headers.map((h) => `${h.name} (${h.type})`).join(", ")}

<strong>Dataset Sample (first ${sampleSize} rows):</strong>
<pre>${JSON.stringify(datasetSample, null, 2)}</pre>

<strong>CRITICAL INSTRUCTIONS:</strong>
You MUST analyze the chart image in detail and report the specific numeric values you can see.
${selectedColumns.length > 0 ? `
This chart is specifically visualizing these columns: <strong>${selectedColumns.join(', ')}</strong>
Focus your analysis on the relationship between these columns and the patterns visible in the chart data.
` : ''}

For EACH category visible in the chart, you must:
1. Read and state the EXACT or APPROXIMATE numeric value shown
2. Compare values: identify which is highest, lowest, and calculate differences
3. Provide statistical insights: totals, averages, distributions
4. Explain what these specific numbers mean in business context

Example of expected analysis:
"Looking at the chart:
- Category A shows approximately X (highest)
- Category B shows approximately Y 
- Category C shows approximately Z (lowest)
- The difference between highest and lowest is [X-Z]
- Category A represents [percentage]% of the total
- This indicates that..."
`;

    if (dto.questions && dto.questions.length > 0) {
      userPrompt += `
<strong>Specific Questions:</strong>
${dto.questions.map((q, i) => `${i + 1}. ${q}`).join("<br>")}
`;
    }

    const requiredSections =
      language === "vi"
        ? [
          "1. Phân tích dữ liệu chi tiết",
          "2. Đánh giá loại biểu đồ và tính phù hợp",
          "3. Điểm mạnh của trực quan hóa hiện tại",
          "4. Điểm yếu hoặc các khía cạnh cần cải thiện",
          "5. Đề xuất cụ thể",
          "6. Thông tin chi tiết và thống kê bổ sung",
          "7. Đề xuất các phương án trực quan hóa thay thế",
        ]
        : [
          "1. Detailed Data Analysis",
          "2. Chart Type and Suitability Evaluation",
          "3. Strengths of Current Visualization",
          "4. Weaknesses or Areas for Improvement",
          "5. Specific Recommendations",
          "6. Additional Insights and Statistics",
          "7. Proposed Visualization Alternatives",
        ];

    userPrompt += `
Please analyze the chart image and dataset following this structure:

<strong>MANDATORY FIRST SECTION - Detailed Data Reading:</strong>
Before anything else, you MUST:
1. Read every visible value/number from the chart image
2. List each category/label with its corresponding numeric value
3. State which has the highest value, lowest value, and the exact numbers
4. Calculate and show comparisons (differences, ratios, percentages)
5. Provide statistical summary (total, average, distribution)

Then continue with standard evaluation sections.

<strong>HTML Formatting Requirements:</strong>
- <h2> for section titles with style="color: #2563eb; font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem;"
- <p> for paragraphs with style="margin-bottom: 0.75rem; line-height: 1.6; color: #fffff;"
- <ul> with style="list-style-type: disc; margin-left: 1.5rem; margin-bottom: 0.75rem; padding-left: 1rem;"
- <li> with style="margin-bottom: 0.5rem; line-height: 1.6; display: list-item; color: #fffff;"
- <strong> for emphasis and numbers with style="color: #fffff; font-weight: 600;"
- Use <code> tags for specific values: <code style="background: #1f2937; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #fffff;">value</code>

<strong>Required Sections (use these as h2 headers):</strong>
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
      model: "openai/gpt-4o", // Use GPT-4o (best vision model for chart analysis)
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
      datasetInfo: {
        name: chart.dataset.name,
        rows: datasetInfo.totalRows,
        columns: datasetInfo.totalColumns,
      },
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

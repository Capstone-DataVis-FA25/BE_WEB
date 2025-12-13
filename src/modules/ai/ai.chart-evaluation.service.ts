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

  private async postChat(body: any, tag?: string): Promise<any> {
    const url = `${this.baseUrl}/chat/completions`;
    const maxAttempts = 3;
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
}

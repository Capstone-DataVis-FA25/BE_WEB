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
      "HTTP-Referer": "http://localhost:3000",
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
    const systemPrompt = `You are an expert data visualization analyst. You will evaluate charts based on:
1. Data visualization best practices
2. Chart type appropriateness for the data
3. Color scheme and aesthetics
4. Clarity and readability
5. Accuracy of data representation
6. Accessibility considerations

When analyzing a chart image and dataset, please provide:

1. Summary of the chart and dataset meaning:
- What type of chart is this?
- What issue or topic does the chart represent?
- What are the notable points or trends from the chart and data?

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
Answer in language: ${language}.`;

// Build user prompt with dataset info and questions
    let userPrompt = `
I have a chart with the following details:

<strong>Dataset Information:</strong>
- Total Rows: ${datasetInfo.totalRows}
- Total Columns: ${datasetInfo.totalColumns}
- Columns: ${datasetInfo.headers.map((h) => `${h.name} (${h.type})`).join(", ")}

<strong>Dataset Sample (first ${sampleSize} rows):</strong>
<pre>${JSON.stringify(datasetSample, null, 2)}</pre>
`;

    if (dto.questions && dto.questions.length > 0) {
      userPrompt += `
<strong>Specific Questions:</strong>
${dto.questions.map((q, i) => `${i + 1}. ${q}`).join("<br>")}
`;
    }

    userPrompt += `
Please analyze the chart image and the dataset using the required evaluation structure.

Return the final output in clean HTML format only.

Use simple HTML structure:
- <h2> for section titles with style="color: #2563eb; font-size: 1.125rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem;"
- <p> for paragraphs with style="margin-bottom: 0.75rem; line-height: 1.6; color: #ffffff;"
- <ul> with style="list-style-type: disc; margin-left: 1.5rem; margin-bottom: 0.75rem; padding-left: 1rem;"
- <li> with style="margin-bottom: 0.5rem; line-height: 1.6; display: list-item;"
- <strong> for emphasis.

Each section must have a numbered <h2> title (e.g., "1. Summary of the Chart", "2. Suitability Evaluation", ...).

Your response MUST cover:
1. Overall assessment of the chart quality 
2. Strengths of the current visualization 
3. Weaknesses or areas for improvement
4. Specific recommendations 
5. Additional insights
6. Additional visualization directions

Return ONLY the HTML content without markdown or backticks.
Answer in language: ${language}.
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

    console.log("userPrompt", userPrompt);

    const body = {
      model: "openai/gpt-4o-mini", // Use GPT-4o-mini with vision (more stable)
      messages: modelMessages,
      temperature: 0.7,
      max_tokens: 2000,
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

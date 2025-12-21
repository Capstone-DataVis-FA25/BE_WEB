import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { parse } from 'fast-csv';
import { Readable } from 'stream';
import { PythonShell } from 'python-shell';
import { CHART_CONFIG_JSON_SCHEMA } from './dto/generate-chart-config.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'google/gemini-2.5-flash-lite-preview-09-2025';
  private readonly apiKey: string;
  // Safety limits used when sending CSV to the AI in a single request
  private readonly CLEAN_MAX_CHARS = 30_000; // Drastically reduced to avoid output token limits
  private readonly CLEAN_MAX_TOKENS = 20_000; // conservative token estimate

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
  }

  private async loadUserGuide(): Promise<string> {
    try {
      const guidePath = path.join(__dirname, 'USER_GUIDE_DRIVER_STEPS.md');
      const content = await fs.promises.readFile(guidePath, 'utf8');
      return `# DataVis User Guide\n\n${content}`;
    } catch (err) {
      this.logger.warn('Could not load user guide, continuing without it');
      return '';
    }
  }

  private getCommonHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:3000', // hoặc domain thật khi deploy
      'X-Title': 'DataVis Assistant',
    };
  }

  /** ========================= CHAT AI ========================= */
  async chatWithAi(message?: string, messagesJson?: string, languageCode?: string) {
    if (!message) throw new Error('Vui lòng cung cấp message');
    if (!this.apiKey) throw new InternalServerErrorException('AI service is not configured');

    interface HistMsg { role: 'user' | 'assistant'; content: string; }
    let history: HistMsg[] = [];
    if (messagesJson) {
      try {
        const parsed = JSON.parse(messagesJson);
        if (Array.isArray(parsed))
          history = parsed.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
      } catch { }
    }

    const targetLang = languageCode || 'auto';

    // Load documentation for context
    const userGuideDoc = await this.loadUserGuide();

    const systemPrompt = `You are a DataVis Web Application assistant with access to the official user guide.

${userGuideDoc}

RESPONSE FORMAT RULES:
1. **Use Markdown formatting** for better readability:
   - Use **bold** for important terms and UI elements (buttons, menus, sections)
   - Use numbered lists (1., 2., 3.) for step-by-step instructions
   - Use bullet points (-) for features or options
   - Use > blockquotes for tips or warnings
   - Use headings (##) to separate sections when needed

2. **Structure your answers clearly**:
   - Start with a brief summary (1-2 sentences)
   - Follow with detailed steps or explanation
   - End with a helpful tip or next action (if rnt)

3. **Reference UI elements that users can SEE**:
   - Use visible labels: "New Chart button", "Dataset selector", "Chart Type dropdown"
   - Use locations: "in the upper right corner", "in the sidebar", "at the top of the page"
   - DON'T mention technical selectors like #btn-new-chart or .class-name
   - DO describe what users see: "Click the blue **New Chart** button in the top right"

4. **Follow documented workflows**:
   - Reference exact page names and navigation paths
   - Use the correct workflow from the user guide
   - If info is not in the guide, clearly state it

EXAMPLE RESPONSE FORMAT:

**Question:** "How to create a new chart?"

**Answer:**
Để tạo biểu đồ mới trong DataVis, bạn làm theo các bước sau:

## Các bước thực hiện

1. **Vào trang Charts**
   - Click vào menu **"Charts"** ở thanh điều hướng chính
   - Hoặc truy cập trực tiếp tại \`/workspace/charts\`

2. **Tạo biểu đồ mới**
   - Tìm nút **"New Chart"** ở góc trên bên phải màn hình
   - Click vào nút này để bắt đầu

3. **Chọn template tại Chart Gallery**
   - Hệ thống sẽ chuyển bạn đến trang Gallery
   - Chọn dataset từ menu dropdown **"Dataset"** (hoặc dùng sample data)
   - Lọc template theo danh mục tại dropdown **"Category"**
   - Browse qua các template và click **"Continue"** trên template bạn thích

4. **Customize trong Chart Editor**
   - Đổi loại biểu đồ bằng **Chart Type selector**
   - Quản lý dữ liệu tại phần **Series Management**
   - Tùy chỉnh màu sắc, trục, chú thích tại phần **Chart Settings**
   - Click nút **"Save"** để lưu biểu đồ

> **💡 Mẹo:** Bạn có thể bỏ qua bước chọn dataset để dùng sample data và thử nghiệm ngay!

**Tiếp theo:** Bạn muốn tìm hiểu về loại biểu đồ nào? (Line, Bar, Pie, Heatmap...)

---

IMPORTANT: Speak naturally about UI elements users can see. DON'T expose technical implementation details. Language: ${targetLang}.`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16),
      { role: 'user', content: message },
    ];

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getCommonHeaders(this.apiKey),
      body: JSON.stringify({ model: this.model, messages: modelMessages, temperature: 0 }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to get AI response');
    }

    const data = await res.json();
    const reply = this.cleanAnswer(data?.choices?.[0]?.message?.content ?? '');
    if (!reply) throw new InternalServerErrorException('AI returned empty response');

    return { reply, processingTime: 'N/A', messageCount: history.length + 1, language: targetLang, success: true };
  }

  cleanAnswer(raw: string) {
    return raw?.trim() || '';
  }

  /** ========================= INTENT DETECTION ========================= */
  async detectIntent(message: string): Promise<'create_chart' | 'list_datasets' | 'clean_data' | 'general_chat'> {
    if (!this.apiKey) return 'general_chat';

    const systemPrompt = `You are an intent classifier for a data visualization app.
    Classify the user's message into one of these categories:
    - "create_chart": User wants to visualize data, draw a chart, plot a graph.
    - "list_datasets": User wants to see their available datasets, list files, check data.
    - "clean_data": User wants to clean, format, or process data.
    - "general_chat": Any other casual conversation, questions about how to use, or unclear intents.

    Do not answer the user's question. ONLY return the category name.`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getCommonHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          messages: modelMessages,
          temperature: 0,
          max_tokens: 10
        }),
      });

      if (!res.ok) return 'general_chat';

      const data = await res.json();
      const intent = data?.choices?.[0]?.message?.content?.trim()?.toLowerCase();

      this.logger.log(`[detectIntent] Message: "${message}" -> Intent: ${intent}`);

      if (['create_chart', 'list_datasets', 'clean_data'].includes(intent)) {
        return intent as any;
      }
      return 'general_chat';
    } catch (e) {
      this.logger.error(`[detectIntent] Error: ${e.message}`);
      return 'general_chat';
    }
  }

  /** ========================= CSV CLEAN ========================= */
  private estimateTokens(text: string) {
    return Math.ceil((text?.length || 0) / 4);
  }

  private async sendCleanRequest(csvText: string, payload?: Partial<CleanCsvDto>): Promise<string> {
    const MAX_CHARS = 30_000; // Drastically reduced to avoid output token limits
    const MAX_TOKENS = 10_000; // Reduced input tokens
    const MAX_OUTPUT_TOKENS = 8_000; // Reduced output token limit
    const REQUEST_TIMEOUT = 60000; // 60 seconds

    this.logger.log(`[sendCleanRequest] Starting, CSV length: ${csvText.length}`);

    // Build additional cleaning instructions based on user-selected options
    const additionalInstructions: string[] = [];

    if (payload?.removeOutliers === true) {
      additionalInstructions.push('- Remove or cap outliers: detect numeric outliers using IQR method and cap them to reasonable bounds');
    }

    if (payload?.validateDomain === true) {
      additionalInstructions.push('- Validate domain constraints: check if values make sense (e.g., age 0-120, valid email format)');
    }

    if (payload?.standardizeUnits === true) {
      additionalInstructions.push('- Standardize units: convert all measurements to consistent units (e.g., km to m, lbs to kg)');
    }

    // Base cleaning instructions (always applied)
    const baseInstructions = [
      '- Trim whitespace from all cells',
      '- Remove exact duplicate rows (keep first occurrence)',
      '- Standardize text case: capitalize proper names (cities, person names), use title case for multi-word fields',
      '- For city names: standardize common variations (e.g., "Sài Gòn", "HCM", "ho chi minh", "Thành Phố Hồ Chí Minh" → all become "Ho Chi Minh")',
      '- For person names: capitalize each word properly (e.g., "john doe", "JOHN DOE" → "John Doe")',
      '- For gender field: standardize to "Male", "Female", "Other" (case-insensitive match)',
      '- For numeric columns:',
      '  * Remove all non-numeric characters except decimal separator',
      `  * Apply thousand separator: ${payload?.thousandsSeparator || ' '}`,
      `  * Apply decimal separator: ${payload?.decimalSeparator || '.'}`,
      '  * Format numbers consistently (e.g., 1000 → 1,000 if thousand separator is comma)',
      '  * Remove outliers that are clearly errors (e.g., weight=6000kg, height=1.70m, age=150)',
      '- For missing/empty values - IMPORTANT RULES:',
      '  * First check: if row has ID column and ID is missing → REMOVE the entire row',
      '  * Second check: if row has name column and name is missing → REMOVE the entire row',
      '  * Third check: count missing fields in the row:',
      '    - If >30% fields missing → REMOVE the entire row',
      '    - If ≤30% fields missing → KEEP row and fill ALL missing values using these rules:',
      '  * For kept rows with missing values, fill based on column type:',
      '    - Numeric columns (age, weight, height, income, etc.): calculate mean/median of that column, fill missing cells with the mean (rounded appropriately)',
      '    - Text columns (city, name, status, etc.): find the MOST COMMON value (mode) in that column and fill missing cells with that value',
      '    - Date columns: find the MOST COMMON date in that column and fill missing cells with that date',
      '    - Gender/category columns: find the MOST COMMON category and fill missing cells with that value',
      '  * IMPORTANT: Calculate mean/mode BEFORE filling, then apply to all missing cells in that column',
      '  * Each row MUST have same number of columns as header',
      '  * Do NOT remove columns, do NOT shift data, do NOT leave any empty cells',
      '- For date columns: standardize to YYYY-MM-DD format',
      '- Do NOT invent data, do NOT add new rows, do NOT skip columns'
    ];

    // Combine base instructions with additional user-selected options
    const allInstructions = [...baseInstructions, ...additionalInstructions];

    const systemPrompt = (payload?.notes ? payload.notes + '\n\n' : '') +
      'You are a data cleaning assistant. Clean the CSV data and return it in the "data" field as a 2D array. The first inner array is the header row.\n' +
      allInstructions.join('\n');
    const userPrompt = 'Original CSV:\n' + csvText;

    if (csvText.length > MAX_CHARS || this.estimateTokens(systemPrompt + userPrompt) > MAX_TOKENS) {
      this.logger.error(`[sendCleanRequest] CSV too large: ${csvText.length} chars`);
      throw new InternalServerErrorException('CSV too large for single-request AI');
    }

    if (!this.apiKey) {
      this.logger.error(`[sendCleanRequest] No API key configured!`);
      throw new InternalServerErrorException('OpenRouter API key not configured');
    }

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cleaned_data',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            required: ['data'],
            additionalProperties: false,
          },
        },
      },
    };

    const maxRetries = 4;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`[sendCleanRequest] Attempt ${attempt + 1}/${maxRetries + 1}, calling ${this.baseUrl}/chat/completions`);
        this.logger.debug(`[sendCleanRequest] Model: ${this.model}, temp: 0`);

        // Add timeout wrapper
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getCommonHeaders(this.apiKey),
          body: JSON.stringify(body),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        this.logger.log(`[sendCleanRequest] Got response: ${res.status} ${res.statusText}`);

        const text = await res.text().catch(() => '');
        this.logger.debug(`[sendCleanRequest] Response body length: ${text?.length || 0} chars`);

        if (!res.ok) {
          this.logger.warn(`[sendCleanRequest] Non-OK response: ${res.status}`);
          if ([429, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
            const backoff = 300 * Math.pow(2, attempt);
            this.logger.log(`[sendCleanRequest] Retrying after ${backoff}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          this.logger.error(`[sendCleanRequest] API error: ${res.status} - ${text}`);
          throw new Error(`AI error ${res.status}: ${text}`);
        }
        try {
          const data = text ? JSON.parse(text) : null;
          const content = data?.choices?.[0]?.message?.content ?? '';
          const finishReason = data?.choices?.[0]?.finish_reason;

          // Log more details for debugging
          this.logger.log(`[sendCleanRequest] API response structure detected: ${data?.choices ? 'YES' : 'NO'}`);
          this.logger.log(`[sendCleanRequest] Content extracted: ${content ? 'YES' : 'NO'}, length: ${content?.length || 0}`);
          this.logger.log(`[sendCleanRequest] Finish reason: ${finishReason}`);

          // If no content extracted, log what we got
          if (!content) {
            this.logger.error(`[sendCleanRequest] No content in response! Full response preview: ${text?.substring(0, 500)}`);
            throw new Error('No content in API response');
          }

          // Check if response was truncated
          if (finishReason === 'length') {
            this.logger.warn(`[sendCleanRequest] Response truncated by token limit`);
            // Don't retry on truncation - the data is too large
            throw new InternalServerErrorException('Data chunk too large for AI processing. This will be handled by automatic chunking.');
          }

          // Validate JSON is complete (has closing braces)
          const trimmedContent = (content || '').trim();
          if (trimmedContent && !trimmedContent.endsWith('}') && !trimmedContent.endsWith(']')) {
            this.logger.error(`[sendCleanRequest] Response appears truncated: last 50 chars = ${trimmedContent.slice(-50)}`);
            throw new InternalServerErrorException('AI returned incomplete JSON');
          }

          return content;
        } catch (parseErr) {
          this.logger.error(`[sendCleanRequest] Failed to parse API response: ${parseErr.message}`);
          this.logger.error(`[sendCleanRequest] Response text preview: ${text?.substring(0, 200)}`);
          throw new Error(`Failed to parse API response: ${parseErr.message}`);
        }
      } catch (err: any) {
        this.logger.error(`[sendCleanRequest] Attempt ${attempt + 1} failed: ${err?.message || err}`);

        // Don't retry on truncation or timeout - these won't be fixed by retrying
        if (err?.name === 'AbortError') {
          this.logger.error(`[sendCleanRequest] Request timed out after ${REQUEST_TIMEOUT}ms`);
          throw err;
        }

        // Check for 'too large' in message (works for both Error and InternalServerErrorException)
        if (err?.message?.includes('too large')) {
          this.logger.error(`[sendCleanRequest] Data too large, won't retry`);
          throw err;
        }

        if (attempt === maxRetries) {
          this.logger.error(`[sendCleanRequest] All retries exhausted, throwing error`);
          throw err;
        }
        const backoff = 300 * Math.pow(2, attempt);
        this.logger.log(`[sendCleanRequest] Retrying after ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    this.logger.warn(`[sendCleanRequest] Exhausted all retries, returning original CSV`);
    return csvText;
  }

  async cleanCsv(payload: CleanCsvDto) {
    const csvText = (payload?.csv ?? '').toString();
    if (!csvText) throw new BadRequestException('CSV is empty');

    this.logger.log(`[cleanCsv] Starting, CSV length: ${csvText.length} chars`);
    this.logger.debug(`[cleanCsv] API key configured: ${this.apiKey ? 'YES' : 'NO'}`);
    this.logger.debug(`[cleanCsv] Model: ${this.model}`);

    const cleanedCsv = await this.sendCleanRequest(csvText, payload);

    this.logger.log(`[cleanCsv] Got response, length: ${cleanedCsv?.length || 0} chars`);
    this.logger.debug(`[cleanCsv] Response starts with: ${cleanedCsv?.substring(0, 100)}`);
    this.logger.debug(`[cleanCsv] Response ends with: ${cleanedCsv?.substring(Math.max(0, cleanedCsv.length - 100))}`);

    // Validate response isn't empty or too small
    if (!cleanedCsv || cleanedCsv.trim().length < 10) {
      this.logger.error(`[cleanCsv] Response too short or empty`);
      throw new InternalServerErrorException('AI returned empty response');
    }

    // Parse JSON response with structured output format: {"data": [[...]]}
    let rows: any[][] = [];
    try {
      this.logger.debug(`[cleanCsv] Attempting to parse JSON...`);
      const parsed = JSON.parse(cleanedCsv);
      this.logger.debug(`[cleanCsv] JSON parsed successfully, checking structure...`);

      if (parsed && Array.isArray(parsed.data)) {
        rows = parsed.data;
        this.logger.log(`[cleanCsv] Found data array with ${rows.length} rows`);
      } else if (Array.isArray(parsed)) {
        rows = parsed; // fallback if AI returns array directly
        this.logger.log(`[cleanCsv] Using parsed array directly with ${rows.length} rows`);
      } else {
        this.logger.error(`[cleanCsv] Invalid structure. Type: ${typeof parsed}, Has data: ${!!parsed?.data}, Keys: ${Object.keys(parsed || {}).join(', ')}`);
        throw new Error('Invalid response structure');
      }
    } catch (err) {
      this.logger.error(`[cleanCsv] Failed to parse JSON response: ${err.message}`);
      this.logger.error(`[cleanCsv] Response preview (first 500 chars): ${cleanedCsv?.substring(0, 500)}`);
      this.logger.error(`[cleanCsv] Response preview (last 500 chars): ${cleanedCsv?.substring(Math.max(0, cleanedCsv.length - 500))}`);

      // Check if it's a truncation issue
      if (err.message?.includes('Unterminated') || err.message?.includes('Unexpected end')) {
        throw new InternalServerErrorException('AI response was truncated - your data may be too large. Try uploading a smaller file.');
      }

      throw new InternalServerErrorException('AI returned invalid JSON format');
    }

    this.logger.log(`[cleanCsv] Parsed ${rows.length} rows`);

    return { data: rows, rowCount: rows.length, columnCount: rows[0]?.length || 0 };
  }

  /** ========================= LARGE CSV TEXT CLEAN (with progress) ========================= */
  async cleanLargeCsvText(input: { csvText: string; options?: any }) {
    const { csvText, options } = input;
    if (!csvText) throw new BadRequestException('CSV text is required');

    this.logger.log(`[cleanLargeCsvText] Starting, CSV length: ${csvText.length} chars`);

    // Parse CSV text into rows
    const rows = this.csvToRows(csvText);
    if (!rows.length) throw new BadRequestException('No rows found in CSV');

    const header = rows[0];
    const defaultRowsPerChunk = 200;
    const chunks: any[][][] = [];

    // Split into chunks
    for (let i = 1; i < rows.length; i += defaultRowsPerChunk) {
      chunks.push(rows.slice(i, i + defaultRowsPerChunk));
    }

    this.logger.log(`[cleanLargeCsvText] Split into ${chunks.length} chunks`);

    const results: any[][][] = [];
    const concurrency = Math.min(3, chunks.length);
    const inflight: Promise<void>[] = [];
    let completedCount = 0;

    // Emit initial progress
    if (options?.onProgress) {
      options.onProgress(0, chunks.length);
    }

    const schedule = (chunk: any[][], idx: number) => {
      const task = (async () => {
        const subResults: any[][] = [];

        // Sub-chunking logic (same as cleanLargeCsvToMatrix)
        const makeSubchunks = async (rows: any[][]) => {
          const out: any[][][] = [];
          let current: any[][] = [];
          for (const r of rows) {
            current.push(r);
            const csv = await this.rowsToCsv([header, ...current]);
            if (csv.length >= this.CLEAN_MAX_CHARS * 0.8) {
              current.pop();
              if (current.length === 0) {
                out.push([r]);
                current = [];
              } else {
                out.push(current.slice());
                current = [r];
              }
            }
          }
          if (current.length) out.push(current.slice());
          return out;
        };

        const subchunks = await makeSubchunks(chunk);

        for (let subIndex = 0; subIndex < subchunks.length; subIndex++) {
          const sub = subchunks[subIndex];
          const csv = await this.rowsToCsv([header, ...sub]);

          try {
            const cleaned = await this.cleanCsv({ csv, notes: options?.notes } as any);
            if (Array.isArray(cleaned?.data) && cleaned.data.length) {
              subResults.push(...cleaned.data.slice(1)); // skip header
            } else {
              this.logger.warn(`Chunk ${idx} sub ${subIndex}: AI returned no cleaned rows`);
            }
          } catch (err) {
            this.logger.error(`Chunk ${idx} sub ${subIndex} failed: ${err.message}`);

            if (err.message?.includes('too large')) {
              this.logger.log(`Chunk ${idx} sub ${subIndex} still too large, splitting further...`);

              const midpoint = Math.floor(sub.length / 2);
              if (midpoint > 0) {
                const firstHalf = sub.slice(0, midpoint);
                const secondHalf = sub.slice(midpoint);

                try {
                  const csv1 = await this.rowsToCsv([header, ...firstHalf]);
                  const cleaned1 = await this.cleanCsv({ csv: csv1, notes: options?.notes } as any);
                  if (Array.isArray(cleaned1?.data) && cleaned1.data.length) {
                    subResults.push(...cleaned1.data.slice(1));
                  }
                } catch (err1) {
                  this.logger.error(`First half of chunk ${idx}.${subIndex} failed: ${err1.message}`);
                }

                try {
                  const csv2 = await this.rowsToCsv([header, ...secondHalf]);
                  const cleaned2 = await this.cleanCsv({ csv: csv2, notes: options?.notes } as any);
                  if (Array.isArray(cleaned2?.data) && cleaned2.data.length) {
                    subResults.push(...cleaned2.data.slice(1));
                  }
                } catch (err2) {
                  this.logger.error(`Second half of chunk ${idx}.${subIndex} failed: ${err2.message}`);
                }
              } else {
                this.logger.error(`Cannot split further - single row too large`);
              }
            }
          }
        }

        results[idx] = [header, ...subResults];

        // Report progress
        completedCount++;
        if (options?.onProgress) {
          options.onProgress(completedCount, chunks.length);
        }
      })();

      inflight.push(task);
      task.finally(() => {
        const i = inflight.indexOf(task);
        if (i >= 0) inflight.splice(i, 1);
      });
      return task;
    };

    chunks.forEach((chunk, idx) => schedule(chunk, idx));
    await Promise.all(inflight);

    // Merge & deduplicate
    const merged: any[][] = [header];
    const seen = new Set<string>();
    results.forEach(chunkRows => {
      chunkRows.slice(1).forEach(row => {
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(row);
        }
      });
    });

    this.logger.log(`[cleanLargeCsvText] Completed, merged ${merged.length - 1} rows (deduplicated)`);

    return { data: merged, rowCount: merged.length, columnCount: merged[0]?.length || 0 };
  }

  /** ========================= EXCEL / CSV PARSING =========================*/
  private async resolveFileBuffer(file: any): Promise<Buffer> {
    if (file?.buffer) return file.buffer as Buffer;
    if (file?.path) {
      const buf = await fs.promises.readFile(file.path);
      fs.promises.unlink(file.path).catch(() => undefined);
      return buf;
    }
    throw new BadRequestException('Unsupported file input');
  }

  private extractRowsFromFile(buffer: Buffer, filename: string): any[][] {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.csv')) return this.csvToRows(buffer.toString('utf8'));
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    return rows.filter(r => (r || []).some(cell => String(cell ?? '').trim() !== ''));
  }

  private csvToRows(csv: string): any[][] {
    return csv.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '').map(this.parseCsvLine);
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') { if (line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
        else current += ch;
      } else {
        if (ch === ',') { result.push(current); current = ''; }
        else if (ch === '"') inQuotes = true;
        else current += ch;
      }
    }
    result.push(current);
    return result;
  }

  private async rowsToCsv(rows: any[][]): Promise<string> {
    const escapeCell = (v: any) => {
      const s = String(v ?? '').trim();
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map(r => r.map(escapeCell).join(',')).join('\n');
  }

  /** ========================= LARGE CSV CLEAN ========================= */
  async cleanLargeCsvToMatrix(input: { file: any; options?: { rowsPerChunk?: number; concurrency?: number; notes?: string; onProgress?: (completed: number, total: number) => void } }) {
    const { file, options } = input;
    if (!file) throw new BadRequestException('File is required');
    const buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
    if (!rows.length) throw new BadRequestException('No rows found');

    const header = rows[0];
    const defaultRowsPerChunk = options?.rowsPerChunk ?? 200; // Reduced to 200 rows per chunk
    const chunks: any[][][] = [];

    // Chia thành các chunks nhỏ
    for (let i = 1; i < rows.length; i += defaultRowsPerChunk) {
      chunks.push(rows.slice(i, i + defaultRowsPerChunk));
    }

    const results: any[][][] = [];
    const concurrency = Math.min(options?.concurrency ?? 3, chunks.length);
    const inflight: Promise<void>[] = [];
    let completedCount = 0;

    // Emit initial progress
    if (options?.onProgress) {
      options.onProgress(0, chunks.length);
    }

    const schedule = (chunk: any[][], idx: number) => {
      const task = (async () => {
        const subResults: any[][] = [];

        // Chia subchunk theo ký tự CSV để không vượt CLEAN_MAX_CHARS
        const makeSubchunks = async (rows: any[][]) => {
          const out: any[][][] = [];
          let current: any[][] = [];
          for (const r of rows) {
            current.push(r);
            const csv = await this.rowsToCsv([header, ...current]);
            // Use 80% of max as safety margin
            if (csv.length >= this.CLEAN_MAX_CHARS * 0.8) {
              current.pop();
              if (current.length === 0) {
                out.push([r]);
                current = [];
              } else {
                out.push(current.slice());
                current = [r];
              }
            }
          }
          if (current.length) out.push(current.slice());
          return out;
        };

        const subchunks = await makeSubchunks(chunk);

        for (let subIndex = 0; subIndex < subchunks.length; subIndex++) {
          const sub = subchunks[subIndex];
          const csv = await this.rowsToCsv([header, ...sub]);

          try {
            const cleaned = await this.cleanCsv({ csv, notes: options?.notes } as any);
            if (Array.isArray(cleaned?.data) && cleaned.data.length) {
              subResults.push(...cleaned.data.slice(1)); // bỏ header
            } else {
              this.logger.warn(`Chunk ${idx} sub ${subIndex}: AI returned no cleaned rows`);
            }
          } catch (err) {
            this.logger.error(`Chunk ${idx} sub ${subIndex} failed: ${err.message}`);

            // If chunk still too large, split it further
            if (err.message?.includes('too large')) {
              this.logger.log(`Chunk ${idx} sub ${subIndex} still too large (${csv.length} chars), splitting further...`);

              // Split this subchunk in half and retry
              const midpoint = Math.floor(sub.length / 2);
              if (midpoint > 0) {
                const firstHalf = sub.slice(0, midpoint);
                const secondHalf = sub.slice(midpoint);

                // Try first half
                try {
                  const csv1 = await this.rowsToCsv([header, ...firstHalf]);
                  const cleaned1 = await this.cleanCsv({ csv: csv1, notes: options?.notes } as any);
                  if (Array.isArray(cleaned1?.data) && cleaned1.data.length) {
                    subResults.push(...cleaned1.data.slice(1));
                  }
                } catch (err1) {
                  this.logger.error(`First half of chunk ${idx}.${subIndex} failed: ${err1.message}`);
                }

                // Try second half
                try {
                  const csv2 = await this.rowsToCsv([header, ...secondHalf]);
                  const cleaned2 = await this.cleanCsv({ csv: csv2, notes: options?.notes } as any);
                  if (Array.isArray(cleaned2?.data) && cleaned2.data.length) {
                    subResults.push(...cleaned2.data.slice(1));
                  }
                } catch (err2) {
                  this.logger.error(`Second half of chunk ${idx}.${subIndex} failed: ${err2.message}`);
                }
              } else {
                this.logger.error(`Cannot split further - single row too large`);
              }
            }
          }
        }

        results[idx] = [header, ...subResults];

        // Report progress
        completedCount++;
        if (options?.onProgress) {
          options.onProgress(completedCount, chunks.length);
        }
      })();

      inflight.push(task);
      task.finally(() => {
        const i = inflight.indexOf(task);
        if (i >= 0) inflight.splice(i, 1);
      });
      return task;
    };

    chunks.forEach((chunk, idx) => schedule(chunk, idx));
    await Promise.all(inflight);

    // Merge & deduplicate
    const merged: any[][] = [header];
    const seen = new Set<string>();
    results.forEach(chunkRows => {
      chunkRows.slice(1).forEach(row => {
        const key = JSON.stringify(row);
        if (!seen.has(key)) { seen.add(key); merged.push(row); }
      });
    });

    return merged;
  }

  /** ========================= EXCEL CLEAN ========================= */
  async cleanExcelToMatrix(input: { file: any; options?: { notes?: string; onProgress?: (completed: number, total: number) => void } }) {
    const { file, options } = input;
    if (!file) throw new BadRequestException('File is required');
    const filename = (file?.originalname || file?.filename || '').toLowerCase();

    this.logger.log(`[cleanExcelToMatrix] Processing file: ${filename}`);

    // CSV files always use chunked cleaning
    if (filename.endsWith('.csv')) {
      this.logger.log(`[cleanExcelToMatrix] Detected CSV file, using cleanLargeCsvToMatrix`);
      return this.cleanLargeCsvToMatrix({ file, options });
    }

    // For Excel files, extract rows first
    this.logger.log(`[cleanExcelToMatrix] Resolving file buffer...`);
    const buffer = await this.resolveFileBuffer(file);
    this.logger.log(`[cleanExcelToMatrix] Extracting rows from Excel...`);
    const rows = this.extractRowsFromFile(buffer, filename);
    if (!rows.length) throw new BadRequestException('Uploaded file has no data');

    this.logger.log(`[cleanExcelToMatrix] Excel file has ${rows.length} rows (including header)`);

    // If Excel file is large (>100 rows), use chunked cleaning for progress tracking
    if (rows.length > 100) {
      this.logger.log(`[cleanExcelToMatrix] Using chunked cleaning for large Excel file (${rows.length} rows)`);
      // Convert to in-memory "file-like" object that cleanLargeCsvToMatrix can process
      const csvText = await this.rowsToCsv(rows);
      const csvBuffer = Buffer.from(csvText, 'utf8');
      const tempFile = {
        buffer: csvBuffer,
        originalname: filename.replace(/\.xlsx?$/i, '.csv'),
        filename: filename.replace(/\.xlsx?$/i, '.csv'),
      };
      return this.cleanLargeCsvToMatrix({ file: tempFile, options });
    }

    // Small Excel files: clean directly (still report progress as 1/1 chunk)
    this.logger.log(`[cleanExcelToMatrix] Small file (${rows.length} rows), cleaning directly...`);

    if (options?.onProgress) {
      this.logger.debug(`[cleanExcelToMatrix] Reporting initial progress: 0/1`);
      options.onProgress(0, 1);
    }

    this.logger.log(`[cleanExcelToMatrix] Converting rows to CSV...`);
    const csv = await this.rowsToCsv(rows);
    this.logger.log(`[cleanExcelToMatrix] CSV length: ${csv.length} chars, calling cleanCsv...`);

    const cleaned = await this.cleanCsv({ csv, notes: options?.notes } as any);

    this.logger.log(`[cleanExcelToMatrix] Cleaning completed, rows: ${cleaned.rowCount}`);

    if (options?.onProgress) {
      this.logger.debug(`[cleanExcelToMatrix] Reporting final progress: 1/1`);
      options.onProgress(1, 1);
    }

    return { data: cleaned.data, rowCount: cleaned.rowCount, columnCount: cleaned.columnCount };
  }
  async generateChartConfig(input: {
    prompt: string;
    datasetId: string;
    headers: Array<{ id: string; name: string; type: string }>;
    chartType?: string;
  }) {
    const { prompt, headers, chartType } = input;

    if (!this.apiKey) {
      throw new InternalServerErrorException("AI service is not configured");
    }

    if (!headers || headers.length === 0) {
      throw new BadRequestException("Dataset headers are required");
    }

    this.logger.log(
      `[generateChartConfig] Generating config for prompt: "${prompt}"${chartType ? ` with enforced type: ${chartType}` : ''}`
    );
    this.logger.log(
      `[generateChartConfig] Available headers: ${JSON.stringify(headers)}`
    );

    // Build system prompt with chart configuration knowledge
    const systemPrompt = `You are an expert data visualization assistant specializing in creating chart configurations.

**Available Dataset Headers:**
${headers.map((h, idx) => `${idx + 1}. "${h.name}" (id: ${h.id}, type: ${h.type})`).join("\n")}

**STRICT CHART VALIDATION RULES (Frontend Compatibility):**
You must ONLY select columns that match these data types for each axis. IF A REQUESTED CHART TYPE DOES NOT HAVE VALID COLUMNS, SELECT A DIFFERENT VALID CHART TYPE OR RETURN AN ERROR EXPLANATION.

- **Line Chart (line)**:
  - X-Axis: text, date, number
  - Y-Axis: number ONLY

- **Bar Chart (bar)**:
  - X-Axis: text, date, number
  - Y-Axis: number, date

- **Area Chart (area)**:
  - X-Axis: text, date, number
  - Y-Axis: number ONLY

- **Scatter Chart (scatter)**:
  - X-Axis: number ONLY
  - Y-Axis: number ONLY

- **Cycle Plot (cycleplot)**:
  - X-Axis (Period): text, number, date
  - Y-Axis (Value): number ONLY

- **Pie/Donut (pie, donut)**:
  - Label Key: text, date
  - Value Key: number ONLY

- **Heatmap (heatmap)**:
  - XAxis & YAxis: text, date, number
  - Value Key: number ONLY

- **Histogram (histogram)**:
  - Data Column: number ONLY

${chartType && chartType !== 'auto' ? `**CRITICAL INSTRUCTION**: The user has EXPLICITLY requested a "${chartType}" chart. You MUST generate a configuration for "${chartType}" IF compatible columns exist. If not, explain why.` : ''}
${chartType === 'auto' ? `**CRITICAL INSTRUCTION**: The user has requested AUTO selection. You MUST analyze the dataset headers and prompt to select the single BEST chart type from the supported list that COMPLIES with the validation rules above.` : ''}

**CRITICAL: Full Config Structure with BOTH Root AND Nested Properties**

**IMPORTANT NAMING RULES:**
1. **Axis Keys**: ALWAYS use the exact **Header ID** for xAxisKey, yAxisKeys, labelKey, valueKey, etc.
2. **Axis Labels**: ALWAYS use the exact **Header Name** for xAxisLabel, yAxisLabel. Do NOT invent new labels.
3. **Series Names**: ALWAYS use the exact **Header Name** for series name.

ALL chart types must have BOTH:
1. Properties at ROOT level (chartType, width, height, xAxisKey, yAxisKeys, etc.)
2. Nested "config" object (duplicate + additional settings)
3. Nested "formatters" object (optional)
4. Nested "axisConfigs" object (for axis keys and series)

**FOR LINE, BAR, AREA, SCATTER - DUAL Structure:**
{
  "chartType": "line",
  "width": 800,
  "height": 500,
  "title": "Chart Title",
  "xAxisKey": "column_id",      // ← At root (can be empty string)
  "yAxisKeys": ["value_id"],    // ← At root (can be empty array)
  "theme": "dark",
  "showLegend": true,
  "showGrid": true,
  "showTooltip": true,
  "margin": { "top": 50, "left": 80, "right": 50, "bottom": 80 },
  "xAxisLabel": "Dataset Header Name X",  // ← USE EXACT HEADER NAME
  "yAxisLabel": "Dataset Header Name Y",  // ← USE EXACT HEADER NAME
  "config": {                   // ← NESTED config with ALL settings
    "title": "Chart Title",
    "width": 800,
    "height": 500,
    "margin": { "top": 50, "left": 80, "right": 50, "bottom": 80 },
    "theme": "dark",
    "backgroundColor": "#000000ff",
    "showLegend": true,
    "showGrid": true,
    "showTooltip": true,
    "animationDuration": 400,
    "gridOpacity": 0.2,
    "legendPosition": "top",
    "xAxisStart": "auto",
    "yAxisStart": "auto",
    "xAxisRotation": 0,
    "yAxisRotation": 0,
    "showAxisLabels": true,
    "showAxisTicks": true,
    "enableZoom": false,
    "enablePan": false,
    "zoomExtent": 100,
    "titleFontSize": 18,
    "labelFontSize": 12,
    "legendFontSize": 12,
    // Line-specific
    "curve": "curveLinear",
    "lineWidth": 2,
    "showPoints": false,
    "pointRadius": 2,
    "showPointValues": false,
    "disabledLines": [],
    // Bar-specific
    "barType": "grouped",
    "barWidth": 20,
    "barSpacing": 1,
    "disabledBars": [],
    "showPoints": false,
    "showPointValues": false
  },
  "formatters": {               // ← NESTED formatters
    "useXFormatter": false,
    "useYFormatter": false,
    "xFormatterType": "number",
    "yFormatterType": "number",
    "xDecimalPlaces": 2,
    "yDecimalPlaces": 2
  },
  "axisConfigs": {              // ← NESTED axis config
    "xAxisKey": "Dataset Header ID X",    // ← REAL axis key here
    "xAxisLabel": "Dataset Header Name X", // ← USE EXACT HEADER NAME
    "xAxisStart": "auto",
    "yAxisLabel": "Dataset Header Name Y", // ← USE EXACT HEADER NAME
    "yAxisStart": "auto",
    "seriesConfigs": [{          // ← Series configs here
      "id": "series_1",
      "name": "Dataset Header Name",     // ← USE EXACT HEADER NAME
      "dataColumn": "Dataset Header ID Y",
      "color": "#4c84ff",
      "visible": true
    }],
    "showAxisLabels": true,
    "showAxisTicks": true,
    "xAxisRotation": 0,
    "yAxisRotation": 0
  }
}

**FOR PIE, DONUT - Nested Structure:**
{
  "chartType": "pie",
  "config": {
    "title": "Pie Chart",
    "width": 600,
    "height": 600,
    "margin": { "top": 50, "left": 50, "right": 50, "bottom": 50 },
    "labelKey": "category_column_id", // Text/Date
    "valueKey": "value_column_id",    // Number ONLY
    "showLegend": true,
    "showLabels": true,
    "showPercentage": true,
    "theme": "dark",
    "backgroundColor": "#000000ff",
    "legendPosition": "bottom"
  },
  "formatters": {
    "useValueFormatter": false,
    "valueFormatterType": "number"
  }
}

**FOR HEATMAP - Nested Structure:**
{
  "chartType": "heatmap",
  "config": {
    "title": "Heatmap",
    "width": 800,
    "height": 500,
    "margin": { "top": 50, "left": 80, "right": 50, "bottom": 80 },
    "showLegend": true,
    "showGrid": true,
    "showTooltip": true,
    "theme": "dark",
    "backgroundColor": "#000000ff",
    "colorScheme": "viridis",
    "showValues": true,
    "cellBorderWidth": 1,
    "cellBorderColor": "#ffffff"
  },
  "axisConfigs": {
    "xAxisKey": "x_column_id",
    "yAxisKey": "y_column_id",
    "valueKey": "value_column_id", // Number ONLY
    "xAxisLabel": "Dataset Header Name X",
    "yAxisLabel": "Dataset Header Name Y"
  },
  "formatters": {
    "useValueFormatter": false,
    "valueFormatterType": "number"
  }
}

**FOR CYCLEPLOT - Nested Structure:**
{
  "chartType": "cycleplot",
  "config": {
    "title": "Cycle Plot",
    "width": 800,
    "height": 500,
    "margin": { "top": 50, "left": 80, "right": 50, "bottom": 80 },
    "showLegend": true,
    "showGrid": true,
    "showTooltip": true,
    "theme": "dark",
    "backgroundColor": "#000000ff",
    "showPoints": false,
    "lineWidth": 2,
    "pointRadius": 2,
    "curve": "curveLinear"
  },
  "axisConfigs": {
    "cycleKey": "cycle_column_id",   // ID of column (text/number/date) representing the Cycle (e.g. Year)
    "periodKey": "period_column_id", // ID of column (text/number/date) representing the Period (e.g. Month)
    "valueKey": "value_column_id",   // ID of column (number ONLY)
    "xAxisLabel": "Dataset Header Name (Period)",
    "yAxisLabel": "Dataset Header Name (Value)"
  },
  "formatters": {
    "useYFormatter": false,
    "yFormatterType": "number"
  }
}

**FOR HISTOGRAM - Nested Structure:**
{
  "chartType": "histogram",
  "config": {
    "title": "Distribution",
    "width": 800,
    "height": 500,
    "margin": { "top": 50, "left": 80, "right": 50, "bottom": 80 },
    "showLegend": false,
    "showGrid": true,
    "showTooltip": true,
    "theme": "light",
    "backgroundColor": "#ffffff",
    "binCount": 10,
    "binMethod": "sturges",
    "showDensity": false
  },
  "axisConfigs": {
    "seriesConfigs": [{
      "id": "series1",
      "name": "Dataset Header Name",
      "dataColumn": "column_id", // Number ONLY
      "color": "#4c84ff",
      "visible": true
    }],
    "xAxisLabel": "Dataset Header Name",
    "yAxisLabel": "Frequency"
  }
}

**Important Rules:**
- ALWAYS use column IDs from dataset headers for keys.
- ALWAYS use column NAMES from dataset headers for labels (xAxisLabel, yAxisLabel, series name).
- For line/bar/area/scatter: Include BOTH root properties AND nested config/formatters/axisConfigs.
- Set xAxisKey and yAxisKeys at root as EMPTY ("" and []) - real values go in axisConfigs.
- Choose appropriate numeric columns for values.
- Vietnamese prompt → Vietnamese suggestedName and explanation.`;

    const userPrompt = `User request: "${prompt}"

Generate a chart configuration that best matches this request.`;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getCommonHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },  // Allow flexible JSON structure
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.error(
          `OpenRouter API error: ${res.status} ${res.statusText} ${text}`
        );
        throw new InternalServerErrorException(
          "Failed to generate chart config from AI"
        );
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new InternalServerErrorException("AI returned empty response");
      }

      const parsed = JSON.parse(content);

      this.logger.log(`[generateChartConfig] Generated config successfully`);
      this.logger.debug(
        `[generateChartConfig] Full config: ${JSON.stringify(parsed)}`
      );

      // Generate chart URL with config
      const configBase64 = Buffer.from(
        JSON.stringify({
          type: parsed.chartType || parsed.type,
          config: parsed,  // Full config with chartType, config, formatters, axisConfigs
          name: parsed.suggestedName,
          datasetId: input.datasetId,
        })
      ).toString("base64url");

      const chartUrl = `/chart-editor?datasetId=${input.datasetId}`;

      return {
        type: parsed.chartType || parsed.type,
        config: parsed,  // Return full chart config
        explanation: parsed.explanation,
        suggestedName: parsed.suggestedName,
        chartUrl: chartUrl,
        success: true,
      };
    } catch (error) {
      this.logger.error(`[generateChartConfig] Error: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to generate chart config: ${error.message}`
      );
    }
  }
  async forecast(options?: {
    csvData?: string;
    targetColumn?: string;
    featureColumns?: string[];
    modelType?: string;
    forecastWindow?: number;
  }) {
    this.logger.log('[forecast] Starting forecast execution');

    // Validate required parameters
    if (!options?.csvData) {
      throw new BadRequestException('CSV data is required for forecast');
    }
    if (!options?.targetColumn) {
      throw new BadRequestException('Target column is required for forecast');
    }
    if (!options?.modelType) {
      throw new BadRequestException('Model type is required for forecast (SVR or LSTM)');
    }
    if (!options?.forecastWindow) {
      throw new BadRequestException('Forecast window is required for forecast');
    }

    this.logger.log('[forecast] Running forecast script');

    // Resolve project root and Python script path
    // Use process.cwd() so it works the same in dev and after build,
    // assuming the Nest app is started from the BE_WEB project root.
    const projectRoot = process.cwd();

    const scriptPath = path.join(
      projectRoot,
      'src',
      'modules',
      'ai',
      'ai-model',
      'AI_Training.py',
    );

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      this.logger.error(`[forecast] Script not found at: ${scriptPath}`);
      throw new InternalServerErrorException('Forecast script not found');
    }

    const scriptDir = path.dirname(scriptPath);
    const venvPythonPath = path.resolve(projectRoot, 'venv_tf', 'Scripts', 'python.exe');

    // Log paths for debugging
    this.logger.debug(`[forecast] Script dir: ${scriptDir}`);
    this.logger.debug(`[forecast] Project root: ${projectRoot}`);
    this.logger.debug(`[forecast] Python venv path: ${venvPythonPath}`);

    // Verify the Python executable exists
    if (!fs.existsSync(venvPythonPath)) {
      this.logger.error(`[forecast] Python venv not found at: ${venvPythonPath}`);
      throw new InternalServerErrorException(`Python virtual environment not found at: ${venvPythonPath}`);
    }

    // If CSV data is provided, write it to a temp file and pass as argument
    let tempFilePath: string | null = null;
    const scriptArgs: string[] = [];

    if (options?.csvData) {
      try {
        const aiModelDir = path.dirname(scriptPath);
        tempFilePath = path.join(aiModelDir, `temp_data_${Date.now()}.csv`);
        await fs.promises.writeFile(tempFilePath, options.csvData, 'utf8');
        scriptArgs.push(tempFilePath);
        this.logger.log(`[forecast] Created temp CSV file: ${tempFilePath}`);
        this.logger.log(`[forecast] CSV file will be passed to Python script as argument (PRODUCTION MODE)`);
      } catch (err: any) {
        this.logger.error(`[forecast] Failed to write temp CSV: ${err.message}`);
        throw new InternalServerErrorException('Failed to prepare CSV data');
      }
    } else {
      this.logger.error(`[forecast] No CSV data provided - this should never happen in production!`);
      throw new BadRequestException('CSV data is required');
    }

    // Prepare environment variables for Python script
    const pythonEnv: Record<string, string> = {
      ...process.env,
      PYTHONPATH: '', // Clear PYTHONPATH to avoid conflicts with D:\python-packages
    };

    // Add forecast parameters as environment variables (all required, validated above)
    pythonEnv.TARGET_COLUMN = options.targetColumn;
    pythonEnv.MODEL_TYPE = options.modelType;
    pythonEnv.FORECAST_WINDOW = options.forecastWindow.toString();

    this.logger.log(`[forecast] Using dataset CSV data and forecast parameters`);

    const pythonOptions: any = {
      mode: 'text' as const,
      pythonPath: venvPythonPath, // Use venv Python with TensorFlow 2.16.1
      pythonOptions: ['-u'], // Unbuffered output
      scriptPath: path.dirname(scriptPath),
      args: scriptArgs, // Pass command line arguments to the script (CSV file path)
      env: pythonEnv,
    };

    return new Promise<{ stdout: string[]; stderr: string[]; exitCode: number; forecastData?: any; chartImageUrl?: string | null }>((resolve, reject) => {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const pyshell = new PythonShell('AI_Training.py', pythonOptions);

      // Collect stdout
      pyshell.on('message', (message: string) => {
        stdout.push(message);
        this.logger.debug(`[forecast] stdout: ${message}`);
      });

      // Collect stderr
      pyshell.on('stderr', (message: string) => {
        stderr.push(message);
        this.logger.warn(`[forecast] stderr: ${message}`);
      });

      // Handle completion
      pyshell.end(async (err, code, signal) => {
        // Clean up temp file if created
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.promises.unlink(tempFilePath).catch((unlinkErr) => {
            this.logger.warn(`[forecast] Failed to delete temp file: ${unlinkErr.message}`);
          });
        }

        if (err) {
          const fullError = stderr.length > 0
            ? stderr.join('\n')
            : err.message;
          this.logger.error(`[forecast] Python script error: ${fullError}`);
          this.logger.error(`[forecast] Exit code: ${code}, Signal: ${signal}`);
          this.logger.error(`[forecast] Last stdout lines: ${stdout.slice(-10).join('\n')}`);
          reject(new InternalServerErrorException(`Forecast script failed: ${fullError.substring(0, 500)}`));
          return;
        }

        // Filter out TensorFlow info messages from stderr (they're not real errors)
        const realErrors = stderr.filter(line => {
          const lower = line.toLowerCase();
          return !lower.includes('tensorflow') &&
            !lower.includes('onednn') &&
            !lower.includes('cpu_feature_guard') &&
            !lower.includes('i tensorflow') &&
            line.trim().length > 0;
        });

        // Check if script failed with non-zero exit code AND has real errors
        if (code !== 0 && code !== null && realErrors.length > 0) {
          const errorOutput = realErrors.length > 0
            ? realErrors.join('\n')
            : stdout.slice(-20).join('\n');
          this.logger.error(`[forecast] Script exited with code ${code}`);
          this.logger.error(`[forecast] Error output: ${errorOutput}`);
          reject(new InternalServerErrorException(`Forecast script failed with exit code ${code}: ${errorOutput.substring(0, 500)}`));
          return;
        }

        // If exit code is non-zero but only TensorFlow warnings, treat as success
        let finalExitCode = code || 0;
        if (code !== 0 && code !== null && realErrors.length === 0) {
          this.logger.warn(`[forecast] Script exited with code ${code} but only TensorFlow warnings, treating as success`);
          finalExitCode = 0; // Normalize to success
        }

        // Filter stderr to remove TensorFlow warnings before returning
        const filteredStderr = realErrors;

        // Parse JSON from stdout if present
        let forecastData = null;
        const stdoutText = stdout.join('\n');
        const jsonStartMarker = '<FORECAST_JSON_START>';
        const jsonEndMarker = '<FORECAST_JSON_END>';

        const jsonStartIndex = stdoutText.indexOf(jsonStartMarker);
        const jsonEndIndex = stdoutText.indexOf(jsonEndMarker);

        this.logger.log(`[forecast] Looking for JSON markers: startIndex=${jsonStartIndex}, endIndex=${jsonEndIndex}`);

        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
          try {
            // Extract JSON text between markers, removing any newlines that might have been inserted
            let jsonText = stdoutText.substring(
              jsonStartIndex + jsonStartMarker.length,
              jsonEndIndex
            ).trim();

            // Remove any newlines that might have been inserted by stdout line splitting
            // The JSON should be on a single line, so replace newlines with spaces
            jsonText = jsonText.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\s+/g, ' ').trim();

            this.logger.log(`[forecast] Extracted JSON text length: ${jsonText.length} chars`);
            this.logger.log(`[forecast] First 200 chars of JSON: ${jsonText.substring(0, 200)}`);
            this.logger.log(`[forecast] Last 200 chars of JSON: ${jsonText.substring(Math.max(0, jsonText.length - 200))}`);

            forecastData = JSON.parse(jsonText);
            this.logger.log(`[forecast] Successfully parsed forecast JSON data. Predictions: ${forecastData.predictions?.length || 0}`);
          } catch (parseError: any) {
            this.logger.warn(`[forecast] Failed to parse forecast JSON: ${parseError.message}`);
            const failedJsonText = stdoutText.substring(jsonStartIndex + jsonStartMarker.length, jsonEndIndex);
            this.logger.warn(`[forecast] JSON text length: ${failedJsonText.length} chars`);
            this.logger.warn(`[forecast] JSON text around error position: ${failedJsonText.substring(Math.max(0, 4600), Math.min(failedJsonText.length, 4650))}`);
          }
        } else {
          this.logger.warn(`[forecast] JSON markers not found in stdout. Last 500 chars of stdout: ${stdoutText.slice(-500)}`);

          // Fallback: Try to find JSON-like structure anywhere in stdout (look for "predictions" key)
          try {
            const jsonMatch = stdoutText.match(/\{[\s\S]*"predictions"[\s\S]*\}/);
            if (jsonMatch) {
              this.logger.log(`[forecast] Found JSON-like structure without markers, attempting to parse...`);
              forecastData = JSON.parse(jsonMatch[0]);
              this.logger.log(`[forecast] Successfully parsed forecast JSON from fallback method. Predictions: ${forecastData.predictions?.length || 0}`);
            }
          } catch (fallbackError: any) {
            this.logger.warn(`[forecast] Fallback JSON parsing also failed: ${fallbackError.message}`);
          }
        }

        this.logger.log(`[forecast] Script completed successfully with exit code: ${finalExitCode}`);
        this.logger.log(`[forecast] Output lines: ${stdout.length}, Real error lines: ${filteredStderr.length}`);

        // Copy forecast chart image to public/uploads if it exists
        let chartImageUrl: string | null = null;
        if (finalExitCode === 0) {
          try {
            const scriptDir = path.dirname(scriptPath);
            const sourceImagePath = path.join(scriptDir, 'forecast_plot.png');

            if (fs.existsSync(sourceImagePath)) {
              // Create public/uploads/forecasts directory if it doesn't exist
              const publicDir = path.join(projectRoot, 'public', 'uploads', 'forecasts');
              if (!fs.existsSync(publicDir)) {
                fs.mkdirSync(publicDir, { recursive: true });
              }

              // Generate unique filename using timestamp
              const timestamp = Date.now();
              const randomSuffix = Math.random().toString(36).substring(2, 8);
              const filename = `forecast-${timestamp}-${randomSuffix}.png`;
              const destImagePath = path.join(publicDir, filename);

              // Copy the image
              await fs.promises.copyFile(sourceImagePath, destImagePath);
              this.logger.log(`[forecast] Chart image copied to: ${destImagePath}`);

              // Generate public URL path (relative to public folder)
              chartImageUrl = `/uploads/forecasts/${filename}`;
              this.logger.log(`[forecast] Chart image URL: ${chartImageUrl}`);

              // Clean up all generated images from script directory (we only need forecast_plot.png)
              const imagesToCleanup = [
                sourceImagePath, // forecast_plot.png (already copied)
                path.join(scriptDir, 'training_predictions.png'),
                path.join(scriptDir, 'model_diagnosis_lstm.png'),
                path.join(scriptDir, 'model_diagnosis_svr.png'),
              ];

              for (const imagePath of imagesToCleanup) {
                if (fs.existsSync(imagePath)) {
                  await fs.promises.unlink(imagePath).catch((unlinkErr) => {
                    this.logger.warn(`[forecast] Failed to delete ${imagePath}: ${unlinkErr.message}`);
                  });
                }
              }
              this.logger.log(`[forecast] Cleaned up temporary images from script directory`);
            } else {
              this.logger.warn(`[forecast] Forecast plot image not found at: ${sourceImagePath}`);
            }
          } catch (imageError: any) {
            this.logger.error(`[forecast] Failed to copy chart image: ${imageError.message}`);
            // Don't fail the entire request if image copy fails
          }
        }

        resolve({
          stdout,
          stderr: filteredStderr, // Return only real errors, not TensorFlow warnings
          exitCode: finalExitCode,
          forecastData, // Include parsed forecast data
          chartImageUrl, // Include chart image URL if available
        });
      });

      // Arguments are already passed via pythonOptions.args
    });
  }
}


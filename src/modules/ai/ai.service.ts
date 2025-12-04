import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { parse } from 'fast-csv';
import { Readable } from 'stream';

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
      } catch {}
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
   - End with a helpful tip or next action (if relevant)

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

    const systemPrompt = (payload?.notes ? payload.notes + '\n\n' : '') +
      'You are a data cleaning assistant. Clean the CSV data and return it in the "data" field as a 2D array. The first inner array is the header row.\n' +
      '- Trim whitespace from all cells\n' +
      '- Remove exact duplicate rows (keep first)\n' +
      '- For numeric columns: remove invalid characters, keep numbers only\n' +
      '- For date columns: standardize format if possible\n' +
      '- Use empty string for missing/unparseable values\n' +
      '- Do NOT invent data';
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

  /** ========================= EXCEL / CSV PARSING ========================= */
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
}

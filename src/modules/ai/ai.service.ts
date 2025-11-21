import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import type { Multer } from 'multer';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { parse } from 'fast-csv';
import { Readable } from 'stream';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'google/gemini-2.5-flash-lite';
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
  }

  private getCommonHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:3000', // hoặc domain thật khi deploy
      'X-Title': 'DataVis Assistant',
    };
  }

  async chatWithAi(message?: string, messagesJson?: string, languageCode?: string) {
    const start = Date.now();
    if (!message) throw new Error('Vui lòng cung cấp message');

    interface HistMsg { role: 'user' | 'assistant'; content: string; }
    let history: HistMsg[] = [];
    if (messagesJson) {
      try {
        const parsed = JSON.parse(messagesJson);
        if (Array.isArray(parsed))
          history = parsed.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
      } catch { /* ignore */ }
    }

    const targetLang = languageCode || 'auto';
    if (!this.apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    const systemPrompt = `You are a statistics and data visualization expert. You are assisting users on a website about data visualization. Answer all questions as a professional statistician and data visualization consultant. Give clear, practical, and actionable advice about charts, analytics, and best practices. If the question is not about data visualization/statistics, politely redirect to relevant topics. Answer in language: ${targetLang}.`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16),
      { role: 'user', content: message },
    ];

    const body = { model: this.model, messages: modelMessages, temperature: 0 } as const;
    const url = `${this.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getCommonHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to get AI response');
    }

    const data = await res.json();
    const reply = this.cleanAnswer(data?.choices?.[0]?.message?.content ?? '');
    if (!reply) {
      this.logger.error('OpenRouter API returned no content');
      throw new InternalServerErrorException('AI returned empty response');
    }

    return {
      reply,
      processingTime: ((Date.now() - start) / 1000).toFixed(2) + 's',
      messageCount: history.length + 1,
      language: targetLang,
      success: true,
    };
  }

  cleanAnswer(raw: string): string {
    return raw?.trim() || '';
  }

  async cleanCsv(payload: CleanCsvDto): Promise<{ data: any[][]; rowCount: number; columnCount: number }> {
    if (!this.apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    // Helper: estimate tokens roughly (approx 4 chars per token)
    const estimateTokens = (text: string) => Math.ceil((text?.length || 0) / 4);
    const MAX_INPUT_TOKENS = 20000; // keep well below provider limit (e.g., 128k)

    // concise system prompt used for chunked requests (much shorter to save context)
    const buildConciseSystemPrompt = (payload?: Partial<CleanCsvDto>) => {
      const parts: string[] = [
        'You are a CSV cleaning assistant. Output ONLY cleaned CSV with header. No explanations, no markdown.',
        'Trim whitespace, normalize quotes, remove exact duplicate rows, leave unfixable cells empty.',
        'For numeric/date columns try to normalize formats; do not invent data. Escape quotes and commas per RFC4180.',
      ];
      if (payload?.dateFormat) parts.push(`Use date format: ${payload.dateFormat}`);
      return parts.join(' ');
    };

    // Direct send to API for a single CSV text
    const sendCleanRequest = async (csvText: string, opts?: Partial<CleanCsvDto>, useShortPrompt = false): Promise<string> => {
      const sysPrompt = useShortPrompt ? buildConciseSystemPrompt(opts) : this.buildSystemPrompt(opts as CleanCsvDto);
      const userPrompt = ['Original CSV:', csvText].join('\n\n');

      // Pre-send guards: ensure we never send a request exceeding safe token/char limits.
      const MAX_CHARS_PER_REQUEST = 250_000; // character guard (~60k tokens conservative)
      const estTokens = estimateTokens(sysPrompt + '\n' + userPrompt);
      if (userPrompt.length > MAX_CHARS_PER_REQUEST || estTokens > MAX_INPUT_TOKENS) {
        this.logger.error(`Refusing to send oversized request: chars=${userPrompt.length}, estTokens=${estTokens}`);
        throw new InternalServerErrorException('CSV chunk too large for AI model; please reduce rowsPerChunk or use streaming/chunked endpoint');
      }

      const body = {
        model: this.model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
      } as const;
      const url = `${this.baseUrl}/chat/completions`;

      // Retry/backoff parameters
      const maxRetries = 4;
      let attempt = 0;

      while (attempt <= maxRetries) {
        attempt++;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: this.getCommonHeaders(this.apiKey),
            body: JSON.stringify(body),
          });

          // read as text first so we can log/inspect invalid JSON bodies
          const text = await res.text().catch(() => '');

          // Retry on transient HTTP errors
          if (!res.ok) {
            const status = res.status;
            this.logger.warn(`OpenRouter API responded ${status} on attempt ${attempt} -- body:${text}`);
            if ([429, 502, 503, 504].includes(status) && attempt <= maxRetries) {
              const backoff = Math.floor(300 * Math.pow(2, attempt - 1) + Math.random() * 200);
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }

            // Non-retryable; break and fallback below
            this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
            break;
          }

          // Try parse JSON response
          let data: any;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (err) {
            this.logger.warn(`OpenRouter API returned invalid JSON (attempt ${attempt}): ${(err as Error)?.message || err} -- body:${text}`);
            if (attempt <= maxRetries) {
              const backoff = Math.floor(300 * Math.pow(2, attempt - 1) + Math.random() * 200);
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            break;
          }

          const rawContent = data?.choices?.[0]?.message?.content ?? text;

          // If the model returned a JSON matrix (array of arrays), parse and convert to CSV
          try {
            const matrix = this.tryParseJsonMatrix(String(rawContent));
            if (matrix && matrix.length) {
              return this.rowsToCsv(matrix as any[]);
            }
          } catch (e) {
            // fallthrough to treat as plain text
          }

          const cleanedCsv = String(rawContent).trim();
          if (!cleanedCsv) {
            this.logger.warn(`OpenRouter API returned empty content (attempt ${attempt}) -- body:${text}`);
            if (attempt <= maxRetries) {
              const backoff = Math.floor(300 * Math.pow(2, attempt - 1) + Math.random() * 200);
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            break;
          }

          // If the AI explicitly says it cannot process, surface a clear error so the caller can decide
          if (/cannot process|not a valid csv|invalid csv|please provide the data in a standard csv/i.test(cleanedCsv)) {
            this.logger.error(`OpenRouter API indicated invalid input: ${cleanedCsv}`);
            throw new InternalServerErrorException('AI returned an error while cleaning CSV: ' + cleanedCsv);
          }

          return cleanedCsv;
        } catch (err) {
          this.logger.warn(`Error calling OpenRouter (attempt ${attempt}): ${(err as Error)?.message || err}`);
          if (attempt <= maxRetries) {
            const backoff = Math.floor(300 * Math.pow(2, attempt - 1) + Math.random() * 200);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          break;
        }
      }

      // Exhausted retries or encountered non-retryable error. Fallback to returning the original chunk
      this.logger.error('sendCleanRequest: Exhausted retries or non-retryable error. Returning original chunk as fallback to avoid aborting the whole job.');
      return csvText;
    };

    const csvText = (payload?.csv ?? '').toString();
    const inputTokens = estimateTokens(csvText) + estimateTokens(this.buildSystemPrompt(payload));

    // If under token threshold, send directly and parse returned CSV
    if (inputTokens < MAX_INPUT_TOKENS) {
      const cleanedCsv = await sendCleanRequest(csvText, payload);
      if (!cleanedCsv || typeof cleanedCsv !== 'string') {
        this.logger.error('OpenRouter API returned no content for CSV cleaning');
        throw new InternalServerErrorException('AI returned empty response');
      }

      const rows = this.csvToRows(cleanedCsv.trim());
      if (!rows || rows.length === 0) {
        this.logger.error('AI returned invalid CSV content');
        throw new InternalServerErrorException('AI returned invalid CSV content');
      }

      return {
        data: rows,
        rowCount: rows.length,
        columnCount: rows[0]?.length || 0,
      };
    }

    // For very large CSVs, caller should use cleanLargeCsvToMatrix which streams and chunks
    this.logger.error('CSV payload too large for single-request cleaning; use cleanLargeCsvToMatrix');
    throw new InternalServerErrorException('CSV too large for single-request cleaning; use large-file endpoint');
  }

  private buildSystemPrompt(payload: CleanCsvDto): string {
    const rules: string[] = [
      'You are a strict data cleaner for tabular data.',
      'Output must be ONLY a valid JSON array of arrays (2D matrix). No markdown, no code fences, no extra text.',
      'The first inner array must be the header row.',
      
      '## Duplicate Handling:',
      '- Remove exact duplicate rows (keep only the first occurrence).',
      '- If a row has identical values in all key columns (if specified), treat as duplicate.',
      
      '## Missing & Empty Data:',
      '- Remove rows that are entirely empty or contain only whitespace.',
      '- For cells with missing values (empty, "N/A", "NA", "null", "NULL", "-", "?", "#N/A"), use empty string ("").',
      '- Do NOT fill missing values with defaults unless explicitly instructed.',
      
      '## Whitespace & Formatting:',
      '- Trim leading/trailing whitespace from all cells.',
      '- Normalize internal whitespace (replace multiple spaces with single space).',
      '- Remove zero-width characters (U+200B, U+FEFF, etc.) and special Unicode whitespace.',
      
      '## Data Type Validation:',
      '- For numeric columns: remove currency symbols, units, and non-numeric characters except valid separators. If result is invalid, use empty string.',
      '- For date columns: attempt to parse and standardize. If unparseable, use empty string.',
      '- For text columns: remove control characters (U+0000 to U+001F except tabs/newlines), normalize quotes.',
      
      '## Outlier Detection (conservative):',
      '- Flag extreme outliers in numeric columns only if they are clearly data entry errors (e.g., age = 999, negative price when price should be positive).',
      '- Do NOT remove valid statistical outliers.',
      
      '## Consistency:',
      '- Standardize categorical values (e.g., "yes"/"Yes"/"YES" → "Yes").',
      '- Fix common typos in known categorical columns if schema example is provided.',
      '- Ensure Boolean-like columns use consistent values (e.g., "Yes"/"No" or "1"/"0").',
      
      'Do not invent data. If a value cannot be deterministically fixed, use empty string.',
      'Return ONLY valid JSON array of arrays, no other text.',
    ];
    
    if (payload.schemaExample) {
      rules.push('Follow the provided CSV schema example strictly for columns order, data types, and sample values.');
    }
    
    if (payload.thousandsSeparator || payload.decimalSeparator) {
      rules.push(`For numeric columns, format with thousands separator "${payload.thousandsSeparator ?? ''}" and decimal separator "${payload.decimalSeparator ?? ''}".`);
    }
    
    if (payload.dateFormat) {
      rules.push(`Format all date-like values to match this date format exactly: ${payload.dateFormat}`);
    }
    
    return rules.join('\n');
  }

  private buildUserPrompt(payload: CleanCsvDto): string {
    const preface: string[] = [];
    if (payload.notes) preface.push(`Notes: ${payload.notes}`);
    if (payload.schemaExample) preface.push('CSV Schema Example:\n' + payload.schemaExample);
    preface.push('Original CSV:\n' + payload.csv);
    preface.push('Return only the cleaned data as a JSON array of arrays (2D matrix). First array is the header row.');
    return preface.join('\n\n');
  }

  async cleanExcelToMatrix(input: { file: any; options?: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string; schemaExample?: string; notes?: string } }): Promise<{ data: any[][]; rowCount: number; columnCount: number }> {
    const { file, options } = input || {};
    if (!file) throw new BadRequestException('File is required');

    // If the uploaded file is a CSV, delegate to the chunked CSV cleaner which
    // safely streams/chunks large CSVs and returns a cleaned matrix. This lets
    // the same endpoint accept both .csv and Excel files.
    const filename = (file?.originalname || file?.filename || 'upload').toLowerCase();
    if (filename.endsWith('.csv')) {
      // cleanLargeCsvToMatrix expects the raw file (buffer or path) and options
      // and will return a cleaned matrix (array of arrays).
      const matrix = await this.cleanLargeCsvToMatrix({ file, options: options as any });
      return {
        data: matrix,
        rowCount: matrix.length,
        columnCount: matrix[0]?.length || 0,
      };
    }

    const buffer: Buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
    if (!rows.length || !rows[0]?.length) throw new BadRequestException('Uploaded file has no data');
    const csv = await this.rowsToCsv(rows);

    if (!this.apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    const systemPrompt = this.buildMatrixSystemPrompt(options || {});
    const userPrompt = this.buildMatrixUserPrompt({ csv, options: options || {} });
    const body = { model: this.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0 } as const;
    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getCommonHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to clean Excel');
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const matrix = this.tryParseJsonMatrix(content);
    if (!matrix || !matrix.length) {
      this.logger.error('AI returned invalid matrix JSON');
      throw new InternalServerErrorException('AI returned invalid matrix JSON');
    }

    return {
      data: matrix,
      rowCount: matrix.length,
      columnCount: matrix[0]?.length || 0,
    };
  }

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
    if (lower.endsWith('.csv')) {
      return this.csvToRows(buffer.toString('utf8'));
    }
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    return rows.filter(r => (r || []).some(cell => String(cell ?? '').trim() !== ''));
  }

  private csvToRows(csv: string): any[][] {
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows: any[][] = [];
    for (const line of lines) {
      if (line.trim() === '') continue;
      rows.push(this.parseCsvLine(line));
    }
    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; }
        } else { current += ch; }
      } else {
        if (ch === ',') { result.push(current); current = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  }

  private async rowsToCsv(rows: any[][]): Promise<string> {
    // For large datasets, process rows in chunks concurrently to reduce blocking
    const CHUNK_SIZE = 1000;

    const formatCell = (v: any) => {
      const s = String(v ?? '').trim();
      // Detect numbers using comma as decimal separator (e.g., "123,45" or "1.234,56")
      const commaDecimalRegex = /^[\d\.\s]+,\d+$/;
      let out = s;
      if (commaDecimalRegex.test(s)) {
        // Wrap with '(, ... )' so downstream processors can detect comma-decimal numbers.
        out = `(,${s})`;
      }
      if (out.includes('"') || out.includes(',') || /\r|\n/.test(out)) {
        return '"' + out.replace(/"/g, '""') + '"';
      }
      return out;
    };

    const formatRow = (r: any[]) => r.map(formatCell).join(',');

    if (rows.length <= CHUNK_SIZE) {
      return rows.map(formatRow).join('\n');
    }

    // Split into chunks (keep header in first chunk only)
    const header = rows[0];
    const dataRows = rows.slice(1);
    const chunks: any[][][] = [];
    for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
      chunks.push(dataRows.slice(i, i + CHUNK_SIZE));
    }

    // Process chunks in parallel using Promise.all to improve throughput for large datasets
    const chunkPromises = chunks.map((chunk, idx) => {
      return Promise.resolve().then(() => {
        const rowsToFormat = idx === 0 ? [header, ...chunk] : chunk;
        return rowsToFormat.map(formatRow).join('\n');
      });
    });

    const chunkResults = await Promise.all(chunkPromises as any);
    return chunkResults.join('\n');
  }

  /**
   * Clean very large CSV by streaming, chunking by rows, cleaning chunks in parallel,
   * merging results with de-duplication and performing an optional final pass.
   * - rowsPerChunk: number of data rows per chunk (default 20000)
   * - concurrency: number of parallel AI calls (default 5)
   * This implementation NEVER chunks by bytes; it chunks by CSV rows and preserves header on every chunk.
   */
  async cleanLargeCsvToMatrix(input: { file: any; options?: { rowsPerChunk?: number; concurrency?: number; thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string; schemaExample?: string; notes?: string; finalCleanup?: boolean } }): Promise<any[][]> {
    const { file, options } = input || {};
    if (!file) throw new BadRequestException('File is required');

    const rowsPerChunk = options?.rowsPerChunk ?? 20000;
    const concurrency = Math.max(1, Math.min(20, options?.concurrency ?? 5));

    // Create readable stream from file buffer or path
    let inputStream: Readable;
    if (file?.buffer) {
      inputStream = Readable.from(file.buffer);
    } else if (file?.path) {
      inputStream = fs.createReadStream(file.path);
    } else {
      throw new BadRequestException('Unsupported file input');
    }

    // Use fast-csv parser with minimal options to avoid unsupported typings.
    // We intentionally only set headers:false so the parser returns arrays for rows.
    const parser = parse({ headers: false });

    // State
    let headerRow: any[] | null = null;
    let currentChunkRows: any[][] = [];
    let chunkIndex = 0;
    const results: Record<number, { data: any[][]; rowCount: number; columnCount: number } | string> = {};
    const inflight: Promise<void>[] = [];

    const schedule = (rows: any[][], idx: number) => {
      const task = (async () => {
        try {
          const csv = this.rowsToCsv([headerRow as any, ...rows]);
          // Call existing cleanCsv to leverage the same prompts/behavior
          const cleaned = await this.cleanCsv({ csv, schemaExample: options?.schemaExample, notes: options?.notes, thousandsSeparator: options?.thousandsSeparator, decimalSeparator: options?.decimalSeparator, dateFormat: options?.dateFormat } as any);
          results[idx] = cleaned;
        } catch (err) {
          this.logger.error(`Chunk ${idx} failed: ${err?.message || err}`);
          throw err;
        }
      })();

      inflight.push(task);

      // Keep inflight array trimmed when tasks complete
      task.finally(() => {
        const i = inflight.indexOf(task);
        if (i >= 0) inflight.splice(i, 1);
      });

      return task;
    };

    const streamPromise = new Promise<void>((resolve, reject) => {
      inputStream.pipe(parser)
        .on('error', (err) => reject(err))
        .on('data', (row: any) => {
          // row is an array when headers=false
          if (!headerRow) {
            headerRow = Array.isArray(row) ? row : Object.values(row);
            return;
          }

          const rowArr = Array.isArray(row) ? row : Object.values(row);
          currentChunkRows.push(rowArr);

          if (currentChunkRows.length >= rowsPerChunk) {
            const toProcess = currentChunkRows;
            currentChunkRows = [];
            const idx = chunkIndex++;
            schedule(toProcess, idx);

            // Throttle concurrency by awaiting any task when inflight >= concurrency
            // Note: we don't await here directly to keep streaming; we occasionally pause if too many inflight
            if (inflight.length >= concurrency) {
              Promise.race(inflight).catch(() => undefined);
            }
          }
        })
        .on('end', async () => {
          try {
            if (!headerRow) return resolve();
            if (currentChunkRows.length > 0) {
              const idx = chunkIndex++;
              schedule(currentChunkRows, idx);
              currentChunkRows = [];
            }
            // Wait for all inflight tasks to finish
            await Promise.all(inflight);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
    });

    try {
      await streamPromise;
    } catch (e) {
      this.logger.error('Failed during streaming/chunking: ' + (e?.message || e));
      throw new InternalServerErrorException('Failed to stream/process CSV');
    }

    // Merge cleaned chunk CSVs in index order. Remove duplicate rows across chunks.
    const mergedRows: any[][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < chunkIndex; i++) {
      const cleanedItem = results[i];
      if (!cleanedItem) continue;

      // cleanedItem may be a CSV string (legacy) or the object returned by cleanCsv ({ data, rowCount, columnCount })
      let rows: any[][];
      if (typeof cleanedItem === 'string') {
        rows = this.csvToRows(cleanedItem);
      } else if (cleanedItem && Array.isArray((cleanedItem as any).data)) {
        rows = (cleanedItem as any).data;
      } else {
        continue;
      }

      if (!rows.length) continue;
      const h = rows[0];
      if (mergedRows.length === 0) mergedRows.push(h);
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          mergedRows.push(row);
        }
      }
    }

    if (mergedRows.length === 0) throw new InternalServerErrorException('No data after cleaning');

    // No final AI pass: return merged cleaned rows directly (chunk -> clean -> merge)
    return mergedRows;
  }

  private buildMatrixSystemPrompt(opts: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string }): string {
    const rules: string[] = [
      'You are a strict data cleaner for tabular data.',
      'Output must be ONLY a valid JSON array of arrays (2D matrix). No markdown, no code fences, no extra text.',
      'The first inner array must be the header row.',
      
      '## Duplicate Handling:',
      '- Remove exact duplicate rows (compare all columns, keep first occurrence).',
      '- The header row does not count as a duplicate.',
      
      '## Missing & Empty Data:',
      '- Remove rows that are entirely empty (all cells are empty string, null, or whitespace).',
      '- For individual missing cells, use empty string ("").',
      '- Recognize these as missing: empty, "N/A", "NA", "null", "NULL", "-", "?", "#N/A", "n/a".',
      
      '## Whitespace & Formatting:',
      '- Trim all cell values (leading/trailing whitespace).',
      '- Collapse multiple internal spaces to single space.',
      '- Remove zero-width characters (U+200B, U+FEFF, etc.) and control characters.',
      
      '## Data Type Validation & Coercion:',
      '- Numeric columns: remove currency symbols ($, €, £), units (km, kg, %), and non-numeric chars. Keep only valid number format.',
      '- Date columns: parse flexibly (MM/DD/YYYY, DD-MM-YYYY, ISO, etc.), then output in specified format. Invalid dates → empty string.',
      '- Text columns: remove control characters (U+0000 to U+001F except tabs/newlines), normalize quotes (curly quotes to straight quotes).',
      
      '## Outlier Detection:',
      '- Only flag obvious data entry errors (e.g., age > 150, age < 0, negative prices when context indicates prices should be positive, dates in year 1800 for modern data).',
      '- Do NOT remove valid statistical outliers (e.g., high salaries, large transaction amounts).',
      
      '## Consistency:',
      '- Standardize case for categorical values (e.g., "male"/"Male"/"MALE" → "Male").',
      '- Fix common typos if pattern is clear (e.g., "Treu" → "True", "Flase" → "False").',
      '- Ensure Boolean-like columns use consistent values (e.g., "Yes"/"No" or "True"/"False" or "1"/"0").',
      
      'Do not invent data. If a value cannot be deterministically fixed, leave it empty string.',
    ];
    
    if (opts.thousandsSeparator || opts.decimalSeparator) {
      rules.push(`For numeric cells, format with thousands separator "${opts.thousandsSeparator ?? ''}" and decimal separator "${opts.decimalSeparator ?? ''}".`);
    }
    
    if (opts.dateFormat) {
      rules.push(`Convert all date-like values to this exact date format: ${opts.dateFormat}.`);
    }
    
    rules.push('Ensure the output is valid JSON and nothing else.');
    return rules.join('\n');
  }

  private buildMatrixUserPrompt(input: { csv: string; options: { schemaExample?: string; notes?: string } }): string {
    const { csv, options } = input;
    const parts: string[] = [];
    if (options.notes) parts.push(`Notes: ${options.notes}`);
    if (options.schemaExample) parts.push('CSV Schema Example (desired):\n' + options.schemaExample);
    parts.push('Original CSV extracted from the uploaded file:\n' + csv);
    parts.push('Return only the cleaned matrix as JSON array of arrays.');
    return parts.join('\n\n');
  }

  private tryParseJsonMatrix(content: string): any[][] | null {
    let text = (content || '').trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/, '').trim();
    }
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) return parsed;
    } catch {}
    const first = text.indexOf('[');
    const last = text.lastIndexOf(']');
    if (first !== -1 && last !== -1 && last > first) {
      const sub = text.slice(first, last + 1);
      try {
        const parsed = JSON.parse(sub);
        if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) return parsed;
      } catch {}
    }
    return null;
  }
}

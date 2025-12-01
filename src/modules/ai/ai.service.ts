import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { CleanCsvDto } from './dto/clean-csv.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'google/gemini-2.5-flash-lite-preview-09-2025';
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

    // CHUNKING LOGIC (parallel processing with concurrency limit)
    const lines = payload.csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    const CHUNK_SIZE = 200; // adjust as needed (rows per chunk)
    const MAX_CONCURRENT = 3; // parallel requests limit to avoid rate-limit

    if (dataLines.length > CHUNK_SIZE) {
      this.logger.log(`CSV has ${dataLines.length} rows, splitting into chunks of ${CHUNK_SIZE} (concurrency: ${MAX_CONCURRENT})`);
      
      // Helper to process one chunk
      const processChunk = async (chunkIndex: number, startRow: number): Promise<any[][]> => {
        const chunkLines = [header, ...dataLines.slice(startRow, startRow + CHUNK_SIZE)];
        const chunkPayload = { ...payload, csv: chunkLines.join('\n') };
        const systemPrompt = this.buildSystemPrompt(chunkPayload);
        const body = {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: this.buildUserPrompt(chunkPayload) },
          ],
          temperature: 0,
          max_tokens: 16000,
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
        const url = `${this.baseUrl}/chat/completions`;
        
        this.logger.log(`Chunk ${chunkIndex}: sending ${chunkLines.length - 1} rows to AI...`);
        const start = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: this.getCommonHeaders(this.apiKey),
          body: JSON.stringify(body),
        });
        
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          this.logger.error(`Chunk ${chunkIndex} failed: ${res.status} ${res.statusText} ${text}`);
          throw new InternalServerErrorException(`Failed to clean CSV chunk ${chunkIndex}`);
        }
        
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) {
          this.logger.error(`Chunk ${chunkIndex}: AI returned no content`);
          throw new InternalServerErrorException(`AI returned empty response for chunk ${chunkIndex}`);
        }
        
        let matrix: any[][] | null = null;
        try {
          const parsed = JSON.parse(content);
          matrix = parsed?.data || null;
        } catch {
          matrix = this.tryParseJsonMatrix(content);
        }
        
        if (!matrix || !matrix.length) {
          this.logger.error(`Chunk ${chunkIndex}: AI returned invalid matrix JSON. Content (first 500 chars): ${content.substring(0, 500)}`);
          throw new InternalServerErrorException(`AI returned invalid matrix JSON for chunk ${chunkIndex}`);
        }
        
        this.logger.log(`Chunk ${chunkIndex}: completed in ${Date.now() - start}ms, got ${matrix.length} rows`);
        return matrix;
      };

      // Process chunks with concurrency limit
      const chunks: Array<{ index: number; startRow: number }> = [];
      for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {
        chunks.push({ index: chunks.length, startRow: i });
      }

      const results: any[][] = [];
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        this.logger.log(`Processing batch ${Math.floor(i / MAX_CONCURRENT) + 1}/${Math.ceil(chunks.length / MAX_CONCURRENT)} (chunks ${batch[0].index}-${batch[batch.length - 1].index})`);
        const batchResults = await Promise.all(
          batch.map(c => processChunk(c.index, c.startRow))
        );
        results.push(...batchResults);
      }

      // Merge results (keep header from first chunk, skip header rows in subsequent chunks)
      let allMatrix: any[][] = results[0] || [];
      for (let i = 1; i < results.length; i++) {
        allMatrix.push(...results[i].slice(1)); // skip header row
      }

      this.logger.log(`All chunks processed, total rows: ${allMatrix.length}`);
      return {
        data: allMatrix,
        rowCount: allMatrix.length,
        columnCount: allMatrix[0]?.length || 0,
      };
    }
    // ...existing code for small CSV...
    const systemPrompt = this.buildSystemPrompt(payload);
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.buildUserPrompt(payload) },
      ],
      temperature: 0,
      max_tokens: 16000,
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

    const url = `${this.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getCommonHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to clean CSV');
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      this.logger.error('OpenRouter API returned no content');
      throw new InternalServerErrorException('AI returned empty response');
    }

    // Parse AI response as JSON matrix from structured output
    let matrix: any[][] | null = null;
    try {
      const parsed = JSON.parse(content);
      matrix = parsed?.data || null;
    } catch {
      matrix = this.tryParseJsonMatrix(content);
    }
    
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

  private buildSystemPrompt(payload: CleanCsvDto): string {
    const rules: string[] = [
      'You are a strict data cleaner for tabular data.',
      'Output must be a JSON object with format: {"data": [[row1], [row2], ...]}',
      'The "data" field contains a 2D array where the first inner array is the header row.',
      'No markdown, no code fences, no extra text outside the JSON object.',
      
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
      'Return ONLY valid JSON object with format: {"data": [[...], [...], ...]}',
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
    preface.push('Return cleaned data as JSON: {"data": [[header], [row1], [row2], ...]}');
    return preface.join('\n\n');
  }

  async cleanExcelToMatrix(input: { file: any; options?: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string; schemaExample?: string; notes?: string } }): Promise<{ data: any[][]; rowCount: number; columnCount: number }> {
    const { file, options } = input || {};
    if (!file) throw new BadRequestException('File is required');
    const buffer: Buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
    if (!rows.length || !rows[0]?.length) throw new BadRequestException('Uploaded file has no data');
    const csv = await this.rowsToCsv(rows);

    if (!this.apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    // CHUNKING LOGIC (parallel processing with concurrency limit)
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    const CHUNK_SIZE = 200; // adjust as needed (rows per chunk)
    const MAX_CONCURRENT = 3; // parallel requests limit to avoid rate-limit

    if (dataLines.length > CHUNK_SIZE) {
      this.logger.log(`Excel has ${dataLines.length} rows, splitting into chunks of ${CHUNK_SIZE} (concurrency: ${MAX_CONCURRENT})`);
      
      // Helper to process one chunk
      const processChunk = async (chunkIndex: number, startRow: number): Promise<any[][]> => {
        const chunkLines = [header, ...dataLines.slice(startRow, startRow + CHUNK_SIZE)];
        const chunkCsv = chunkLines.join('\n');
        const systemPrompt = this.buildMatrixSystemPrompt(options || {});
        const userPrompt = this.buildMatrixUserPrompt({ csv: chunkCsv, options: options || {} });
        const body = {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 16000,
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
        const url = `${this.baseUrl}/chat/completions`;
        
        this.logger.log(`Excel Chunk ${chunkIndex}: sending ${chunkLines.length - 1} rows to AI...`);
        const start = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: this.getCommonHeaders(this.apiKey),
          body: JSON.stringify(body),
        });
        
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          this.logger.error(`Excel Chunk ${chunkIndex} failed: ${res.status} ${res.statusText} ${text}`);
          throw new InternalServerErrorException(`Failed to clean Excel chunk ${chunkIndex}`);
        }
        
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) {
          this.logger.error(`Excel Chunk ${chunkIndex}: AI returned no content`);
          throw new InternalServerErrorException(`AI returned empty response for Excel chunk ${chunkIndex}`);
        }
        
        let matrix: any[][] | null = null;
        try {
          const parsed = JSON.parse(content);
          matrix = parsed?.data || null;
        } catch {
          matrix = this.tryParseJsonMatrix(content);
        }
        
        if (!matrix || !matrix.length) {
          this.logger.error(`Excel Chunk ${chunkIndex}: AI returned invalid matrix JSON. Content (first 500 chars): ${content.substring(0, 500)}`);
          throw new InternalServerErrorException(`AI returned invalid matrix JSON for Excel chunk ${chunkIndex}`);
        }
        
        this.logger.log(`Excel Chunk ${chunkIndex}: completed in ${Date.now() - start}ms, got ${matrix.length} rows`);
        return matrix;
      };

      // Process chunks with concurrency limit
      const chunks: Array<{ index: number; startRow: number }> = [];
      for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {
        chunks.push({ index: chunks.length, startRow: i });
      }

      const results: any[][] = [];
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        this.logger.log(`Excel Processing batch ${Math.floor(i / MAX_CONCURRENT) + 1}/${Math.ceil(chunks.length / MAX_CONCURRENT)} (chunks ${batch[0].index}-${batch[batch.length - 1].index})`);
        const batchResults = await Promise.all(
          batch.map(c => processChunk(c.index, c.startRow))
        );
        results.push(...batchResults);
      }

      // Merge results (keep header from first chunk, skip header rows in subsequent chunks)
      let allMatrix: any[][] = results[0] || [];
      for (let i = 1; i < results.length; i++) {
        allMatrix.push(...results[i].slice(1)); // skip header row
      }

      this.logger.log(`Excel All chunks processed, total rows: ${allMatrix.length}`);
      return {
        data: allMatrix,
        rowCount: allMatrix.length,
        columnCount: allMatrix[0]?.length || 0,
      };
    }

    // Small file - process in one shot
    const systemPrompt = this.buildMatrixSystemPrompt(options || {});
    const userPrompt = this.buildMatrixUserPrompt({ csv, options: options || {} });
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 16000,
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
    
    let matrix: any[][] | null = null;
    try {
      const parsed = JSON.parse(content);
      matrix = parsed?.data || null;
    } catch {
      matrix = this.tryParseJsonMatrix(content);
    }
    
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

  private buildMatrixSystemPrompt(opts: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string }): string {
    const rules: string[] = [
      'You are a strict data cleaner for tabular data.',
      'Output must be a JSON object with format: {"data": [[row1], [row2], ...]}',
      'The "data" field contains a 2D array where the first inner array is the header row.',
      'No markdown, no code fences, no extra text outside the JSON object.',
      
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
    
    rules.push('Ensure the output is a valid JSON object: {"data": [[...], [...], ...]}');
    return rules.join('\n');
  }

  private buildMatrixUserPrompt(input: { csv: string; options: { schemaExample?: string; notes?: string } }): string {
    const { csv, options } = input;
    const parts: string[] = [];
    if (options.notes) parts.push(`Notes: ${options.notes}`);
    if (options.schemaExample) parts.push('CSV Schema Example (desired):\n' + options.schemaExample);
    parts.push('Original CSV extracted from the uploaded file:\n' + csv);
    parts.push('Return cleaned data as JSON: {"data": [[header], [row1], [row2], ...]}');
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
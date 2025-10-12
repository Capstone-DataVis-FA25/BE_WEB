import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CleanCsvDto } from './dto/clean-csv.dto';
import * as XLSX from 'xlsx';
import * as fs from 'fs';


@Injectable()
export class AiCleanerService {
  private readonly logger = new Logger(AiCleanerService.name);

  constructor(private readonly configService: ConfigService) {}

  async cleanCsv(payload: CleanCsvDto): Promise<string> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseUrl = 'https://openrouter.ai/api/v1';
    const model = 'alibaba/tongyi-deepresearch-30b-a3b:free'; // hoặc model khác nếu cần, có thể cho phép truyền từ FE nếu muốn

    if (!apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    const systemPrompt = this.buildSystemPrompt(payload);

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.buildUserPrompt(payload) },
      ],
      temperature: 0,
    } as const;

    const url = `${baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to clean CSV');
    }

    const data = (await res.json()) as any;
    const cleanedCsv = data?.choices?.[0]?.message?.content?.trim();

    if (!cleanedCsv) {
      this.logger.error(`OpenRouter API returned no content`);
      throw new InternalServerErrorException('AI returned empty response');
    }

    return cleanedCsv;
  }

  private buildSystemPrompt(payload: CleanCsvDto): string {
    const rules: string[] = [
      'You are a strict CSV cleaner. Output must be ONLY valid CSV text, no markdown, no code fences, no explanations.',
      'Keep the header row. Maintain the same columns unless instructed to drop/rename by the provided schema.',
      'Standardize whitespace, trim cells, and remove empty trailing rows.',
      'Do not invent data. If a value is invalid and cannot be fixed deterministically, leave it blank.',
      'Escape commas, quotes, and line breaks according to RFC 4180 as needed.',
    ];

    if (payload.schemaExample) {
      rules.push('Follow the provided CSV schema example strictly for columns order and sample types.');
    }
    if (payload.thousandsSeparator || payload.decimalSeparator) {
      rules.push(
        `For numeric columns, use thousands separator "${payload.thousandsSeparator ?? ''}" and decimal separator "${payload.decimalSeparator ?? ''}".`,
      );
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
    return preface.join('\n\n');
  }

  // New: clean uploaded Excel/CSV file and return a 2D JSON matrix
  async cleanExcelToMatrix(input: { file: any; options?: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string; schemaExample?: string; notes?: string } }): Promise<any[][]> {
    const { file, options } = input || {};
    if (!file) throw new BadRequestException('File is required');

    const buffer: Buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
    if (!rows.length || !rows[0]?.length) throw new BadRequestException('Uploaded file has no data');

    // Convert to CSV for more deterministic LLM cleaning
    const csv = this.rowsToCsv(rows);

    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseUrl = 'https://openrouter.ai/api/v1';
    const model = 'gpt-4o';
    if (!apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    const systemPrompt = this.buildMatrixSystemPrompt(options || {});
    const userPrompt = this.buildMatrixUserPrompt({ csv, options: options || {} });

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    } as const;

    const url = `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter API error: ${res.status} ${res.statusText} ${text}`);
      throw new InternalServerErrorException('Failed to clean Excel');
    }
    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content ?? '';
    const matrix = this.tryParseJsonMatrix(content);
    if (!matrix) {
      this.logger.error('AI returned invalid matrix JSON');
      throw new InternalServerErrorException('AI returned invalid matrix JSON');
    }
    return matrix;
  }

  private async resolveFileBuffer(file: any): Promise<Buffer> {
    if (file?.buffer) return file.buffer as Buffer;
    if (file?.path) {
      const buf = await fs.promises.readFile(file.path);
      // Best effort cleanup for temp file
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
    // Use xlsx for xls/xlsx and other Excel formats
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    // Trim trailing empty rows
    return rows.filter(r => (r || []).some(cell => String(cell ?? '').trim() !== ''));
  }

  private csvToRows(csv: string): any[][] {
    // Minimal RFC4180 CSV parser for robustness; prefer to let AI do deep cleaning
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
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === ',') {
          result.push(current);
          current = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  private rowsToCsv(rows: any[][]): string {
    return rows
      .map(r =>
        r
          .map((v) => {
            const s = String(v ?? '');
            if (s.includes('"') || s.includes(',') || /\r|\n/.test(s)) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(',')
      )
      .join('\n');
  }

  private buildMatrixSystemPrompt(opts: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string }): string {
    const rules: string[] = [
      'You are a strict data cleaner.',
      'Output must be ONLY a valid JSON array of arrays (2D matrix). No markdown, no code fences, no extra text.',
      'The first inner array must be the header row. Maintain same columns unless clearly invalid per schema example.',
      'Trim whitespace, normalize values, standardize nulls to empty string, and remove empty trailing rows.',
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
    // Strip markdown fences if present
    if (text.startsWith('```')) {
      text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/, '').trim();
    }
    // Try direct parse
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) return parsed as any[][];
    } catch {}
    // Fallback: extract first balanced [ ... ]
    const first = text.indexOf('[');
    const last = text.lastIndexOf(']');
    if (first !== -1 && last !== -1 && last > first) {
      const sub = text.slice(first, last + 1);
      try {
        const parsed = JSON.parse(sub);
        if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) return parsed as any[][];
      } catch {}
    }
    return null;
  }
}

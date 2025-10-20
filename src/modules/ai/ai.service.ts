import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import type { Multer } from 'multer';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { CleanCsvDto } from './dto/clean-csv.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly model = 'openai/gpt-4o-mini';
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

  async cleanCsv(payload: CleanCsvDto): Promise<string> {
    if (!this.apiKey) {
      this.logger.error('OPENROUTER_API_KEY is not configured');
      throw new InternalServerErrorException('AI service is not configured');
    }

    const systemPrompt = this.buildSystemPrompt(payload);
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.buildUserPrompt(payload) },
      ],
      temperature: 0,
    } as const;

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
    const cleanedCsv = data?.choices?.[0]?.message?.content?.trim();
    if (!cleanedCsv) {
      this.logger.error('OpenRouter API returned no content');
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
    if (payload.schemaExample)
      rules.push('Follow the provided CSV schema example strictly for columns order and sample types.');
    if (payload.thousandsSeparator || payload.decimalSeparator) {
      rules.push(`For numeric columns, use thousands separator "${payload.thousandsSeparator ?? ''}" and decimal separator "${payload.decimalSeparator ?? ''}".`);
    }
    if (payload.dateFormat)
      rules.push(`Format all date-like values to match this date format exactly: ${payload.dateFormat}`);
    return rules.join('\n');
  }

  private buildUserPrompt(payload: CleanCsvDto): string {
    const preface: string[] = [];
    if (payload.notes) preface.push(`Notes: ${payload.notes}`);
    if (payload.schemaExample) preface.push('CSV Schema Example:\n' + payload.schemaExample);
    preface.push('Original CSV:\n' + payload.csv);
    return preface.join('\n\n');
  }

  async cleanExcelToMatrix(input: { file: any; options?: { thousandsSeparator?: string; decimalSeparator?: string; dateFormat?: string; schemaExample?: string; notes?: string } }): Promise<any[][]> {
    const { file, options } = input || {};
    if (!file) throw new BadRequestException('File is required');
    const buffer: Buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
    if (!rows.length || !rows[0]?.length) throw new BadRequestException('Uploaded file has no data');
    const csv = this.rowsToCsv(rows);

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

  private rowsToCsv(rows: any[][]): string {
    return rows
      .map(r => r
        .map((v) => {
          const s = String(v ?? '');
          if (s.includes('"') || s.includes(',') || /\r|\n/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(','))
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
    if (opts.dateFormat)
      rules.push(`Convert all date-like values to this exact date format: ${opts.dateFormat}.`);
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

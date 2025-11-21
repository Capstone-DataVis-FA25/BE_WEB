import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
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
  private readonly model = 'openai/gpt-oss-120b';
  private readonly apiKey: string;
  // Safety limits used when sending CSV to the AI in a single request
  private readonly CLEAN_MAX_CHARS = 250_000; // max characters per request
  private readonly CLEAN_MAX_TOKENS = 20_000; // conservative token estimate

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
    const systemPrompt = `You are a statistics and data visualization expert. Answer clearly, practically, and actionable. Language: ${targetLang}.`;

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
    const MAX_CHARS = 250_000;
    const MAX_TOKENS = 20_000;

    const systemPrompt = payload?.notes || 'Clean CSV strictly, output JSON array of arrays';
    const userPrompt = 'Original CSV:\n' + csvText;

    if (csvText.length > MAX_CHARS || this.estimateTokens(systemPrompt + userPrompt) > MAX_TOKENS) {
      throw new InternalServerErrorException('CSV too large for single-request AI');
    }

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    };

    const maxRetries = 4;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getCommonHeaders(this.apiKey),
          body: JSON.stringify(body),
        });
        const text = await res.text().catch(() => '');
        if (!res.ok) {
          if ([429, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(`AI error ${res.status}: ${text}`);
        }
        try {
          const data = text ? JSON.parse(text) : null;
          return data?.choices?.[0]?.message?.content ?? text;
        } catch { return text; }
      } catch (err) {
        if (attempt === maxRetries) throw err;
        await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
      }
    }
    return csvText;
  }

  async cleanCsv(payload: CleanCsvDto) {
    const csvText = (payload?.csv ?? '').toString();
    if (!csvText) throw new BadRequestException('CSV is empty');
    const cleanedCsv = await this.sendCleanRequest(csvText, payload);
    const rows = this.csvToRows(cleanedCsv);
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
 async cleanLargeCsvToMatrix(input: { file: any; options?: { rowsPerChunk?: number; concurrency?: number; notes?: string } }) {
  const { file, options } = input;
  if (!file) throw new BadRequestException('File is required');
  const buffer = await this.resolveFileBuffer(file);
  const rows = this.extractRowsFromFile(buffer, file.originalname || file.filename || 'upload');
  if (!rows.length) throw new BadRequestException('No rows found');

  const header = rows[0];
  const defaultRowsPerChunk = options?.rowsPerChunk ?? 500; // giảm chunk nhỏ hơn
  const chunks: any[][][] = [];

  // Chia thành các chunks nhỏ
  for (let i = 1; i < rows.length; i += defaultRowsPerChunk) {
    chunks.push(rows.slice(i, i + defaultRowsPerChunk));
  }

  const results: any[][][] = [];
  const concurrency = Math.min(options?.concurrency ?? 3, chunks.length);
  const inflight: Promise<void>[] = [];

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
          if (csv.length >= this.CLEAN_MAX_CHARS) {
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
        const cleaned = await this.cleanCsv({ csv, notes: options?.notes } as any);
        if (Array.isArray(cleaned?.data) && cleaned.data.length) {
          subResults.push(...cleaned.data.slice(1)); // bỏ header
        } else {
          this.logger.warn(`Chunk ${idx} sub ${subIndex}: AI returned no cleaned rows`);
        }
      }

      results[idx] = [header, ...subResults];
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
  async cleanExcelToMatrix(input: { file: any; options?: { notes?: string } }) {
    const { file } = input;
    if (!file) throw new BadRequestException('File is required');
    const filename = (file?.originalname || file?.filename || '').toLowerCase();
    if (filename.endsWith('.csv')) return this.cleanLargeCsvToMatrix({ file, options: input.options });
    const buffer = await this.resolveFileBuffer(file);
    const rows = this.extractRowsFromFile(buffer, filename);
    if (!rows.length) throw new BadRequestException('Uploaded file has no data');

    const csv = await this.rowsToCsv(rows);
    const cleaned = await this.cleanCsv({ csv, notes: input.options?.notes } as any);
    return { data: cleaned.data, rowCount: cleaned.rowCount, columnCount: cleaned.columnCount };
  }
}

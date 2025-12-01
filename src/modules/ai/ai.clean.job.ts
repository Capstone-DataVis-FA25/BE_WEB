import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from './ai.service';
import { NotificationService } from '../notification/notification.service';

// In-memory job store (for demo, use Redis/DB for production)
// Includes basic metadata so we can later expose history or compute usage.
type JobStatus = 'pending' | 'done' | 'error' | 'cancelled';

interface AiCleanJobRecord {
  userId: string;
  status: JobStatus;
  // Basic metadata for history/usage tracking
  createdAt: Date;
  updatedAt: Date;
  inputSize?: number; // e.g. csv length, row count, or file size in bytes
  result?: any;
  error?: string;
}

const jobStore = new Map<string, AiCleanJobRecord>();

// Helper only for debugging: expose all jobs (not exported out of module)
export function __debugGetJobs() {
  return Array.from(jobStore.entries()).map(([id, job]) => ({ jobId: id, ...job }));
}

@Injectable()
export class AiCleanJobService {
  private readonly logger = new Logger(AiCleanJobService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
  ) {}

  createJob(userId: string, cleanPayload: any): string {
    const jobId = uuidv4();
    // Estimate input size for later quota/usage calculations
    const inputSize = typeof cleanPayload?.csv === 'string'
      ? cleanPayload.csv.length // approx bytes of CSV text
      : typeof cleanPayload?.fileSize === 'number'
        ? cleanPayload.fileSize // exact file size in bytes for uploads
        : Array.isArray(cleanPayload?.rows)
          ? cleanPayload.rows.length // fallback: number of rows
          : undefined;

    this.logger.log(`Creating AI clean job ${jobId} for user ${userId}`);
    jobStore.set(jobId, {
      userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      inputSize,
    });
    this.processJob(jobId, userId, cleanPayload);
    return jobId;
  }

  private async processJob(jobId: string, userId: string, cleanPayload: any) {
    try {
      this.logger.log(`Processing AI clean job ${jobId} for user ${userId}`);

      // Determine payload type: file upload vs raw CSV text
      let result: any;
      if (cleanPayload?.file) {
        // File upload path
        this.logger.log(`Job ${jobId}: detected file upload (${cleanPayload?.originalName || 'unknown'})`);
        result = await this.aiService.cleanExcelToMatrix({ file: cleanPayload.file, options: cleanPayload.options || {} });
      } else if (typeof cleanPayload?.csv === 'string') {
        // Raw CSV text path
        result = await this.aiService.cleanCsv(cleanPayload);
      } else {
        throw new Error('Unsupported clean payload: missing file or csv text');
      }

      const existing = jobStore.get(jobId);

      // If job was cancelled while processing, do not overwrite with done
      if (existing?.status === 'cancelled') {
        this.logger.warn(`AI clean job ${jobId} finished but was already cancelled; ignoring result`);
        // Optionally notify user that cancelled job finished (skip for now)
        return;
      }

      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'done',
        updatedAt: new Date(),
        result,
      });

      this.logger.log(`AI clean job ${jobId} completed`);
      this.notificationService.notifyUser(userId, {
        type: 'clean-dataset-done',
        jobId,
        userId,
        message: 'Dataset cleaning completed',
      });
    } catch (err: any) {
      this.logger.error(`AI clean job ${jobId} failed: ${err?.message || err}`);

      // If job was cancelled manually, do not overwrite with error
      const existing = jobStore.get(jobId);
      if (existing?.status === 'cancelled') {
        this.logger.warn(`AI clean job ${jobId} was cancelled; skipping error handling`);
        return;
      }

      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'error',
        updatedAt: new Date(),
        error: err?.message,
      });
      this.notificationService.notifyUser(userId, {
        type: 'clean-dataset-error',
        jobId,
        userId,
        message: err?.message || 'Dataset cleaning failed',
      });
    }
  }

  getJobResult(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return null;
    if (job.status === 'done') {
      const result = job.result;
      // Không xoá job khỏi store nữa để giữ lịch sử;
      // chỉ cần đảm bảo không lưu result quá nặng nếu không cần.
      return result;
    }
    if (job.status === 'error') {
      const errMsg = job.error || 'Job failed';
      return { status: job.status, error: errMsg };
    }
    return { status: job.status };
  }

  // Allow cancelling a pending job manually
  cancelJob(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return false;
    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.updatedAt = new Date();
      jobStore.set(jobId, job);
      this.logger.warn(`AI clean job ${jobId} was cancelled manually`);
      return true;
    }
    return false;
  }

  // Internal helper so controller/service có thể lấy lịch sử cho 1 user
  // mà không cần public debug API.
  getUserHistory(userId: string) {
    return Array.from(jobStore.entries())
      .filter(([_, job]) => job.userId === userId)
      .map(([jobId, job]) => ({
        jobId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        inputSize: job.inputSize,
      }));
  }

  // Return all jobs, optionally filtered by status
  getAllJobs(filter?: { status?: JobStatus }) {
    return Array.from(jobStore.entries())
      .filter(([_, job]) => (filter?.status ? job.status === filter.status : true))
      .map(([jobId, job]) => ({
        jobId,
        userId: job.userId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        inputSize: job.inputSize,
      }));
  }

  // Return only pending jobIds
  getPendingJobIds() {
    return Array.from(jobStore.entries())
      .filter(([_, job]) => job.status === 'pending')
      .map(([jobId]) => jobId);
  }

  // Compute total input size for a user (bytes)
  getTotalInputSizeForUser(userId: string) {
    return Array.from(jobStore.values())
      .filter(j => j.userId === userId && typeof j.inputSize === 'number')
      .reduce((sum, j) => sum + (j.inputSize || 0), 0);
  }
}

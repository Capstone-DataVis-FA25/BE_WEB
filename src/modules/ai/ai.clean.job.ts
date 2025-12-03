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
  // Progress tracking
  progress?: number; // 0-100 percentage
  totalChunks?: number; // total number of chunks to process
  completedChunks?: number; // chunks completed so far
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
      progress: 0,
      totalChunks: 0,
      completedChunks: 0,
    });
    this.processJob(jobId, userId, cleanPayload);
    return jobId;
  }

  private async processJob(jobId: string, userId: string, cleanPayload: any) {
    try {
      this.logger.log(`[Job ${jobId}] START processing for user ${userId}`);
      this.logger.debug(`[Job ${jobId}] Payload keys: ${Object.keys(cleanPayload || {}).join(', ')}`);

      // Progress callback to update job and notify user (for progress bar updates)
      const onProgress = (completed: number, total: number) => {
        const job = jobStore.get(jobId);
        if (!job) return;
        const progress = total > 0 ? Math.floor((completed / total) * 100) : 0;
        job.progress = progress;
        job.totalChunks = total;
        job.completedChunks = completed;
        job.updatedAt = new Date();
        jobStore.set(jobId, job);
        this.logger.debug(`[Job ${jobId}] Progress: ${completed}/${total} chunks (${progress}%)`);
        // Emit progress notification (frontend should NOT show toast, only update progress bar)
        this.notificationService.notifyUser(userId, {
          type: 'clean-dataset-progress',
          jobId,
          userId,
          progress,
          completed,
          total,
        });
      };

      // Determine payload type: file upload vs raw CSV text
      let result: any;
      if (cleanPayload?.file) {
        // File upload path
        this.logger.log(`[Job ${jobId}] Detected file upload: ${cleanPayload?.originalName || 'unknown'}`);
        this.logger.debug(`[Job ${jobId}] File size: ${cleanPayload?.fileSize || 'unknown'} bytes`);
        this.logger.log(`[Job ${jobId}] Calling aiService.cleanExcelToMatrix...`);
        const start = Date.now();
        result = await this.aiService.cleanExcelToMatrix({ 
          file: cleanPayload.file, 
          options: { ...cleanPayload.options || {}, onProgress } 
        });
        this.logger.log(`[Job ${jobId}] cleanExcelToMatrix completed in ${Date.now() - start}ms`);
      } else if (typeof cleanPayload?.csv === 'string') {
        // Raw CSV text path
        this.logger.log(`[Job ${jobId}] Detected raw CSV text (length: ${cleanPayload.csv.length} chars)`);
        this.logger.log(`[Job ${jobId}] Calling aiService.cleanCsv...`);
        const start = Date.now();
        result = await this.aiService.cleanCsv({ ...cleanPayload, onProgress });
        this.logger.log(`[Job ${jobId}] cleanCsv completed in ${Date.now() - start}ms`);
      } else {
        this.logger.error(`[Job ${jobId}] Unsupported payload: no file or csv text found`);
        throw new Error('Unsupported clean payload: missing file or csv text');
      }

      this.logger.log(`[Job ${jobId}] AI processing successful, result rows: ${result?.rowCount || 'unknown'}`);

      this.logger.log(`[Job ${jobId}] AI processing successful, result rows: ${result?.rowCount || 'unknown'}`);

      const existing = jobStore.get(jobId);

      // If job was cancelled while processing, do not overwrite with done
      if (existing?.status === 'cancelled') {
        this.logger.warn(`[Job ${jobId}] Finished but was cancelled; ignoring result`);
        return;
      }

      this.logger.log(`[Job ${jobId}] Updating status to 'done' and saving result...`);
      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'done',
        updatedAt: new Date(),
        result,
      });

      this.logger.log(`[Job ${jobId}] COMPLETED successfully, notifying user ${userId}`);
      this.notificationService.notifyUser(userId, {
        type: 'clean-dataset-done',
        jobId,
        userId,
        message: 'Dataset cleaning completed',
      });
      this.logger.log(`[Job ${jobId}] Notification sent`);
    } catch (err: any) {
      this.logger.error(`[Job ${jobId}] FAILED: ${err?.message || err}`);
      this.logger.error(`[Job ${jobId}] Error stack: ${err?.stack || 'no stack'}`);

      this.logger.error(`[Job ${jobId}] FAILED: ${err?.message || err}`);
      this.logger.error(`[Job ${jobId}] Error stack: ${err?.stack || 'no stack'}`);

      // If job was cancelled manually, do not overwrite with error
      const existing = jobStore.get(jobId);
      if (existing?.status === 'cancelled') {
        this.logger.warn(`[Job ${jobId}] Was cancelled; skipping error handling`);
        return;
      }

      this.logger.log(`[Job ${jobId}] Updating status to 'error' and saving error message...`);
      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'error',
        updatedAt: new Date(),
        error: err?.message,
      });
      this.logger.log(`[Job ${jobId}] Notifying user ${userId} of error`);
      this.notificationService.notifyUser(userId, {
        type: 'clean-dataset-error',
        jobId,
        userId,
        message: err?.message || 'Dataset cleaning failed',
      });
      this.logger.log(`[Job ${jobId}] Error notification sent`);
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

  // Get current progress for a job
  getJobProgress(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return null;
    return {
      jobId,
      status: job.status,
      progress: job.progress ?? 0,
      totalChunks: job.totalChunks ?? 0,
      completedChunks: job.completedChunks ?? 0,
    };
  }
}
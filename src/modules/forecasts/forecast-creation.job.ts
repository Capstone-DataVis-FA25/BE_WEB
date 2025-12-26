import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ForecastProcessingService } from './forecast-processing.service';
import { NotificationService } from '../notification/notification.service';
import { ForecastDto } from '../ai/dto/forecast.dto';

type JobStatus = 'pending' | 'done' | 'error' | 'cancelled';

interface ForecastCreationJobRecord {
  userId: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  forecastId?: string;
  result?: any;
  error?: string;
}

const jobStore = new Map<string, ForecastCreationJobRecord>();

@Injectable()
export class ForecastCreationJobService {
  private readonly logger = new Logger(ForecastCreationJobService.name);

  constructor(
    private readonly forecastProcessingService: ForecastProcessingService,
    private readonly notificationService: NotificationService,
  ) { }

  createJob(userId: string, dto: ForecastDto): string {
    // Check if user already has an active (pending) job
    const activeJob = this.getActiveJobForUser(userId);
    if (activeJob) {
      this.logger.warn(`User ${userId} already has an active forecast job: ${activeJob.jobId}`);
      throw new Error(`You already have a forecast in progress. Please wait for it to complete before starting a new one.`);
    }

    const jobId = uuidv4();

    this.logger.log(`Creating forecast creation job ${jobId} for user ${userId}`);
    jobStore.set(jobId, {
      userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Process job asynchronously
    this.processJob(jobId, userId, dto);
    return jobId;
  }

  /**
   * Get the active (pending) job for a user, if any
   */
  private getActiveJobForUser(userId: string): { jobId: string; job: ForecastCreationJobRecord } | null {
    for (const [jobId, job] of jobStore.entries()) {
      if (job.userId === userId && job.status === 'pending') {
        return { jobId, job };
      }
    }
    return null;
  }

  private async processJob(jobId: string, userId: string, dto: ForecastDto) {
    try {
      this.logger.log(`[Job ${jobId}] START processing forecast creation for user ${userId}`);

      // Notify user that forecast has started
      this.notificationService.notifyUser(userId, {
        type: 'forecast-creation-started',
        jobId,
        userId,
        message: 'Forecast creation started',
      });

      // Process forecast (this can take a long time)
      const result = await this.forecastProcessingService.processForecast(dto, userId);

      this.logger.log(`[Job ${jobId}] Forecast processing successful, forecastId: ${result.forecastId}`);

      // Check if job was cancelled
      const existing = jobStore.get(jobId);
      if (existing?.status === 'cancelled') {
        this.logger.warn(`[Job ${jobId}] Finished but was cancelled; ignoring result`);
        return;
      }

      // Update job status
      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'done',
        updatedAt: new Date(),
        forecastId: result.forecastId,
        result,
      });

      // Notify user that forecast is complete
      this.logger.log(`[Job ${jobId}] COMPLETED successfully, notifying user ${userId}`);
      this.notificationService.notifyUser(userId, {
        type: 'forecast-creation-done',
        jobId,
        forecastId: result.forecastId,
        userId,
        message: 'Forecast creation completed',
        time: new Date().toISOString(),
      });
      this.logger.log(`[Job ${jobId}] Notification sent`);
    } catch (err: any) {
      this.logger.error(`[Job ${jobId}] FAILED: ${err?.message || err}`);
      this.logger.error(`[Job ${jobId}] Error stack: ${err?.stack || 'no stack'}`);

      // Check if job was cancelled
      const existing = jobStore.get(jobId);
      if (existing?.status === 'cancelled') {
        this.logger.warn(`[Job ${jobId}] Was cancelled; skipping error handling`);
        return;
      }

      // Update job status to error
      jobStore.set(jobId, {
        ...(existing || { userId, createdAt: new Date() }),
        status: 'error',
        updatedAt: new Date(),
        error: err?.message,
      });

      // Notify user of error
      this.logger.log(`[Job ${jobId}] Notifying user ${userId} of error`);
      this.notificationService.notifyUser(userId, {
        type: 'forecast-creation-error',
        jobId,
        userId,
        message: err?.message || 'Forecast creation failed',
      });
      this.logger.log(`[Job ${jobId}] Error notification sent`);
    }
  }

  getJobStatus(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return null;
    return {
      jobId,
      forecastId: job.forecastId,
      status: job.status,
      error: job.error,
    };
  }

  getJobResult(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job || job.status !== 'done') return null;
    return job.result;
  }

  cancelJob(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return false;
    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.updatedAt = new Date();
      jobStore.set(jobId, job);
      this.logger.warn(`Forecast creation job ${jobId} was cancelled manually`);
      return true;
    }
    return false;
  }
}


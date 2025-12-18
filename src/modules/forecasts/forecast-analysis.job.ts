import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AiChartEvaluationService } from '../ai/ai.chart-evaluation.service';
import { ForecastsService } from './forecasts.service';
import { NotificationService } from '../notification/notification.service';

type JobStatus = 'pending' | 'done' | 'error' | 'cancelled';

interface ForecastAnalysisJobRecord {
  forecastId: string;
  userId: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  result?: string; // Analysis text
  error?: string;
}

const jobStore = new Map<string, ForecastAnalysisJobRecord>();

@Injectable()
export class ForecastAnalysisJobService {
  private readonly logger = new Logger(ForecastAnalysisJobService.name);

  constructor(
    private readonly aiChartEvaluationService: AiChartEvaluationService,
    private readonly forecastsService: ForecastsService,
    private readonly notificationService: NotificationService,
  ) {}

  createJob(forecastId: string, userId: string, chartImageUrl: string, maxAttempts: number = 3): string {
    const jobId = uuidv4();

    this.logger.log(`Creating forecast analysis job ${jobId} for forecast ${forecastId}, user ${userId}`);
    jobStore.set(jobId, {
      forecastId,
      userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Process job asynchronously
    this.processJob(jobId, forecastId, userId, chartImageUrl, maxAttempts);
    return jobId;
  }

  private async processJob(
    jobId: string,
    forecastId: string,
    userId: string,
    chartImageUrl: string,
    maxAttempts: number,
  ) {
    try {
      this.logger.log(`[Job ${jobId}] START processing analysis for forecast ${forecastId}`);

      // Notify user that analysis has started
      this.notificationService.notifyUser(userId, {
        type: 'forecast-analysis-started',
        jobId,
        forecastId,
        userId,
        message: 'Analysis started',
      });

      // Call AI analysis service
      const analysis = await this.aiChartEvaluationService.analyzeForecastChart(
        forecastId,
        chartImageUrl,
        maxAttempts,
      );

      if (!analysis) {
        throw new Error('AI analysis returned empty result');
      }

      this.logger.log(`[Job ${jobId}] AI analysis successful (${analysis.length} chars)`);

      // Check if job was cancelled
      const existing = jobStore.get(jobId);
      if (existing?.status === 'cancelled') {
        this.logger.warn(`[Job ${jobId}] Finished but was cancelled; ignoring result`);
        return;
      }

      // Update forecast with analysis
      await this.forecastsService.update(
        forecastId,
        { analyze: analysis },
        userId,
      );

      this.logger.log(`[Job ${jobId}] Forecast updated with analysis`);

      // Update job status
      jobStore.set(jobId, {
        ...(existing || { forecastId, userId, createdAt: new Date() }),
        status: 'done',
        updatedAt: new Date(),
        result: analysis,
      });

      // Notify user that analysis is complete
      this.logger.log(`[Job ${jobId}] COMPLETED successfully, notifying user ${userId}`);
      this.notificationService.notifyUser(userId, {
        type: 'forecast-analysis-done',
        jobId,
        forecastId,
        userId,
        message: 'Forecast analysis completed',
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
        ...(existing || { forecastId, userId, createdAt: new Date() }),
        status: 'error',
        updatedAt: new Date(),
        error: err?.message,
      });

      // Notify user of error
      this.logger.log(`[Job ${jobId}] Notifying user ${userId} of error`);
      this.notificationService.notifyUser(userId, {
        type: 'forecast-analysis-error',
        jobId,
        forecastId,
        userId,
        message: err?.message || 'Forecast analysis failed',
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

  cancelJob(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return false;
    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.updatedAt = new Date();
      jobStore.set(jobId, job);
      this.logger.warn(`Forecast analysis job ${jobId} was cancelled manually`);
      return true;
    }
    return false;
  }
}


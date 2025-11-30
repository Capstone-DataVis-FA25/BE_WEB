import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from './ai.service';
import { NotificationService } from '../notification/notification.service';

// In-memory job store (for demo, use Redis/DB for production)
const jobStore = new Map<string, { userId: string; status: 'pending'|'done'|'error'; result?: any; error?: string }>();

@Injectable()
export class AiCleanJobService {
  private readonly logger = new Logger(AiCleanJobService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
  ) {}

  createJob(userId: string, cleanPayload: any): string {
    const jobId = uuidv4();
    jobStore.set(jobId, { userId, status: 'pending' });
    this.processJob(jobId, userId, cleanPayload);
    return jobId;
  }

  private async processJob(jobId: string, userId: string, cleanPayload: any) {
    try {
      const result = await this.aiService.cleanCsv(cleanPayload);
      jobStore.set(jobId, { userId, status: 'done', result });
      this.notificationService.notifyUser(userId, {
  type: 'clean-dataset-done',
  jobId,
  userId, // <-- thêm dòng này!
  message: 'Dataset cleaning completed',
});
    } catch (err: any) {
      jobStore.set(jobId, { userId, status: 'error', error: err.message });
      this.notificationService.notifyUser(userId, {
        type: 'clean-dataset-error',
        jobId,
        userId, // <-- thêm dòng này!
        message: err.message || 'Dataset cleaning failed',
      });
    }
  }

  getJobResult(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) return null;
    if (job.status === 'done') {
      const result = job.result;
      jobStore.delete(jobId); // Remove after fetch
      return result;
    }
    if (job.status === 'error') {
      jobStore.delete(jobId);
      throw new Error(job.error || 'Job failed');
    }
    return { status: job.status };
  }
}

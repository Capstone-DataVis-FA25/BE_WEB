import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private readonly redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL, {
      // Stop retrying after 3 attempts; backoff up to 1s between tries
      retryStrategy: (times) => (times >= 3 ? null : Math.min(times * 200, 1000)),
      // Limit per-command retries to avoid long hangs
      maxRetriesPerRequest: 1,
      // Do not attempt to reconnect on protocol errors
      reconnectOnError: () => false,
      // Prevent queuing commands when disconnected
      enableOfflineQueue: false,
    });
  }

  async createLog(payload: {
    actorId?: string;
    actorType?: string;
    action: string;
    resource?: string;
    metadata?: any;
  }) {
    try {
      // 1. Lưu vào Postgres
      const saved = await this.prisma.prisma.activityLog.create({
        data: {
          actorId: payload.actorId ?? null,
          actorType: payload.actorType ?? null,
          action: payload.action,
          resource: payload.resource ?? null,
          metadata: payload.metadata ?? null,
        },
      });

      // 2. Push vào Redis Stream (để consumer đọc & phát)
      const streamId = await this.redis.xadd(
        'activity_logs_stream', // stream key
        '*', // auto id
        'id', saved.id,
        'actorId', saved.actorId ?? '',
        'actorType', saved.actorType ?? '',
        'action', saved.action,
        'resource', saved.resource ?? '',
        'metadata', JSON.stringify(saved.metadata ?? {}),
        'createdAt', saved.createdAt ? saved.createdAt.toISOString() : new Date().toISOString()
      );

      this.logger.debug(`Pushed to stream id=${streamId}`);
      return saved;
    } catch (error) {
      this.logger.error('Failed to create activity log:', error);
      throw error;
    }
  }
}
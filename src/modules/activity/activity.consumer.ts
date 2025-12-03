// src/activity/activity.consumer.ts
import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ActivityGateway } from './activity.gateway';

@Injectable()
export class ActivityConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityConsumer.name);
  private readonly redis: Redis;
  private running = true;
  private groupName = 'activity_consumers';
  private consumerName = `consumer-${process.pid}`;

  constructor(private gateway: ActivityGateway) {
    this.redis = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => (times >= 3 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 1,
      reconnectOnError: () => false,
      enableOfflineQueue: false,
    });
  }

  async onModuleInit() {
    try {
      await this.redis.xgroup('CREATE', 'activity_logs_stream', this.groupName, '$', 'MKSTREAM');
      this.logger.log('Created consumer group');
    } catch (err) {
      if (!/BUSYGROUP/.test(err.message)) this.logger.warn(err.message);
    }

    this.loop();
  }

  async loop() {
    while (this.running) {
      try {
        // Check if Redis is connected before attempting to read
        if (this.redis.status !== 'ready') {
          this.logger.warn('Redis not ready, skipping read attempt');
          await new Promise(r => setTimeout(r, 5000)); // Wait 5s before retry
          continue;
        }

        // BLOCK 2000ms if no message
        const res = await this.redis.xreadgroup(
          'GROUP', this.groupName, this.consumerName,
          'COUNT', 10,
          'BLOCK', 2000,
          'STREAMS', 'activity_logs_stream', '>'
        );

        if (!res) continue;

        // res: [ [ 'activity_logs_stream', [ [id, [k,v,...]], ... ] ] ]
        // Adding explicit type annotation to fix the "Type 'unknown' must have a '[Symbol.iterator]()' method" error
        const streamMessages: Array<[string, Array<[string, string[]]>]> = res as Array<[string, Array<[string, string[]]>]>;

        for (const [, messages] of streamMessages) {
          for (const [id, fields] of messages) {
            const obj: any = {};
            for (let i = 0; i < fields.length; i += 2) {
              obj[fields[i]] = fields[i + 1];
            }

            // parse metadata
            try { obj.metadata = JSON.parse(obj.metadata || '{}'); } catch { }

            // Emit to connected admin clients via gateway
            this.gateway.emitActivity(obj);

            // Acknowledge
            await this.redis.xack('activity_logs_stream', this.groupName, id);
            // Optional: XDEL để giảm kích thước stream
            // await this.redis.xdel('activity_logs_stream', id);
          }
        }
      } catch (err) {
        // Check if it's a connection error and stop trying
        if (err.message?.includes('Connection is closed') || err.message?.includes('ECONNREFUSED')) {
          this.logger.error('Redis connection lost, stopping consumer loop');
          this.running = false;
          break;
        }
        this.logger.error(err);
        await new Promise(r => setTimeout(r, 5000)); // Longer backoff for other errors
      }
    }
  }

  async onModuleDestroy() {
    this.running = false;
    await this.redis.quit();
  }
}



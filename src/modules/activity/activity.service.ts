import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private readonly redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async createLog(payload: {
    actorId?: string;
    actorType?: string;
    action: string;
    resource?: string;
    metadata?: any;
  }) {
    try {
      // Enrich metadata with additional contextual information
      const enrichedMetadata = await this.enrichMetadata(payload);

      // 1. Lưu vào Postgres
      const saved = await this.prisma.prisma.activityLog.create({
        data: {
          actorId: payload.actorId ?? null,
          actorType: payload.actorType ?? null,
          action: payload.action,
          resource: payload.resource ?? null,
          metadata: enrichedMetadata ?? null,
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

  /**
   * Enrich metadata with additional contextual information based on action type
   */
  private async enrichMetadata(payload: { action: string; metadata?: any; actorId?: string }) {
    const { action, metadata = {}, actorId } = payload;
    const enrichedMetadata = { ...metadata };

    try {
      // Add actor information if actorId is provided
      if (actorId) {
        const actor = await this.prisma.prisma.user.findUnique({
          where: { id: actorId },
          select: { firstName: true, lastName: true, email: true }
        });
        if (actor) {
          enrichedMetadata.actor = {
            id: actorId,
            name: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email,
            email: actor.email
          };
        }
      }

      // Enrich specific action types with more meaningful information
      switch (action.toLowerCase()) {
        case 'lock_user':
        case 'block_user':
          if (metadata.userId) {
            const user = await this.prisma.prisma.user.findUnique({
              where: { id: metadata.userId },
              select: { firstName: true, lastName: true, email: true }
            });
            if (user) {
              enrichedMetadata.targetUser = {
                id: metadata.userId,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                email: user.email,
                isActive: metadata.isActive
              };
              enrichedMetadata.description = `User ${enrichedMetadata.actor?.name || 'Unknown'} ${action.toLowerCase().includes('lock') ? 'locked' : 'blocked'} user ${enrichedMetadata.targetUser.name}`;
            }
          }
          break;

        case 'unlock_user':
          if (metadata.userId) {
            const user = await this.prisma.prisma.user.findUnique({
              where: { id: metadata.userId },
              select: { firstName: true, lastName: true, email: true }
            });
            if (user) {
              enrichedMetadata.targetUser = {
                id: metadata.userId,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                email: user.email,
                isActive: metadata.isActive
              };
              enrichedMetadata.description = `User ${enrichedMetadata.actor?.name || 'Unknown'} unlocked user ${enrichedMetadata.targetUser.name}`;
            }
          }
          break;

        case 'user_register':
          enrichedMetadata.description = `New user registered: ${metadata.email || 'Unknown'}`;
          break;

        case 'create_dataset':
          enrichedMetadata.description = `Dataset created: ${metadata.name || 'Unnamed dataset'}`;
          break;

        case 'create_chart':
          enrichedMetadata.description = `Chart created: ${metadata.name || 'Unnamed chart'}`;
          break;

        case 'delete_self_account':
          enrichedMetadata.description = `User deleted their own account: ${enrichedMetadata.actor?.name || 'Unknown user'}`;
          break;

        default:
          // For other actions, try to create a generic description
          if (!enrichedMetadata.description) {
            enrichedMetadata.description = this.generateGenericDescription(action, metadata);
          }
      }
    } catch (error) {
      this.logger.warn('Failed to enrich metadata:', error);
      // Continue with original metadata if enrichment fails
    }

    return enrichedMetadata;
  }

  /**
   * Generate a generic description for actions that don't have specific handling
   */
  private generateGenericDescription(action: string, metadata: any): string {
    // Convert action from snake_case or UPPER_CASE to readable format
    const readableAction = action
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());

    // Try to extract meaningful information from metadata
    const resourceInfo = metadata.name || metadata.email || metadata.id || 'resource';

    return `${readableAction}: ${resourceInfo}`;
  }
}
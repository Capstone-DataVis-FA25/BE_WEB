import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly gateway: NotificationGateway) {}

  notifyUser(userId: string, notification: any) {
    this.gateway.emitToUser(userId, notification);
    this.logger.log(`Sent notification to user ${userId}`);
  }
}

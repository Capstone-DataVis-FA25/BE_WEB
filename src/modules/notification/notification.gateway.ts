import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/user-notification',
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  afterInit(server: Server) {
    this.logger.log('NotificationGateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // FE nên gửi userId khi connect để join room
    const { userId } = client.handshake.query;
    if (userId) {
      client.join(userId);
      this.logger.log(`Client ${client.id} joined room ${userId} (typeof userId: ${typeof userId})`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToUser(userId: string, notification: any) {
    this.server.to(userId).emit('notification:created', notification);
  }

  emitToAll(notification: any) {
    this.server.emit('notification:created', notification);
  }
}

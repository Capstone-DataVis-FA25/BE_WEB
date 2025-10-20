import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/admin-activity', 
})
export class ActivityGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ActivityGateway.name);

  afterInit(server: Server) {
    this.logger.log('ActivityGateway initialized');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitActivity(activity: any) {
    this.server.emit('activity:created', activity);
  }
}

import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SystemService } from './system.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SystemGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SystemGateway.name);
    private connectedClients = new Set<string>();

    constructor(private readonly systemService: SystemService) { }

    async handleConnection(client: Socket) {
        this.connectedClients.add(client.id);
        this.logger.log(`Client connected: ${client.id}. Total clients: ${this.connectedClients.size}`);

        // Send initial system status to the newly connected client
        const status = await this.systemService.getSystemStatus();
        client.emit('systemStatus', status);
    }

    handleDisconnect(client: Socket) {
        this.connectedClients.delete(client.id);
        this.logger.log(`Client disconnected: ${client.id}. Total clients: ${this.connectedClients.size}`);
    }

    @SubscribeMessage('getStatus')
    async handleGetStatus(client: Socket) {
        const status = await this.systemService.getSystemStatus();
        client.emit('systemStatus', status);
    }

    // Method to broadcast system status to all connected clients
    async broadcastSystemStatus() {
        const status = await this.systemService.getSystemStatus();
        this.server.emit('systemStatus', status);
    }

    // Get the number of connected clients
    getConnectedClientsCount(): number {
        return this.connectedClients.size;
    }
}
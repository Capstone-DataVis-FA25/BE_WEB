import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SystemGateway } from './system.gateway';
import { SystemService } from './system.service';

@Injectable()
export class SystemStatusUpdaterService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SystemStatusUpdaterService.name);
    private intervalId: NodeJS.Timeout;

    constructor(
        private readonly systemGateway: SystemGateway,
        private readonly systemService: SystemService,
    ) { }

    async onModuleInit() {
        this.intervalId = setInterval(async () => {
            await this.systemGateway.broadcastSystemStatus();
        }, 5000);

        this.logger.log('System status updater service initialized');
    }

    async onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.logger.log('System status updater service destroyed');
        }
    }
}
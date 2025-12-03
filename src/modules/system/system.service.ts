import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthCheck } from 'src/types/system';

@Injectable()
export class SystemService {
    private readonly startTime: Date;

    constructor(
        private readonly configService: ConfigService,
        private readonly prismaService: PrismaService,
    ) {
        this.startTime = new Date();
    }

    async getSystemStatus() {
        const uptime = process.uptime();
        const systemUptime = os.uptime();
        const memoryUsage = process.memoryUsage();
        const loadAverage = os.loadavg();

        // Perform health checks
        const databaseHealth = await this.checkDatabaseHealth();
        const overallStatus = databaseHealth.status === 'healthy' ? 'healthy' : 'degraded';

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: {
                process: uptime,
                system: systemUptime,
                startTime: this.startTime.toISOString(),
            },
            memory: {
                rss: memoryUsage.rss,
                heapTotal: memoryUsage.heapTotal,
                heapUsed: memoryUsage.heapUsed,
                external: memoryUsage.external,
            },
            cpu: {
                loadAverage,
                cores: os.cpus().length,
            },
            system: {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
            },
            app: {
                version: this.configService.get('npm_package_version', 'unknown'),
                nodeVersion: process.version,
                environment: this.configService.get('NODE_ENV', 'development'),
            },
            healthChecks: {
                database: databaseHealth,
            },
        };
    }

    private async checkDatabaseHealth(): Promise<HealthCheck> {
        try {
            // Attempt a simple database query to check connectivity
            await this.prismaService.prisma.$queryRawUnsafe('SELECT 1');
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }
}
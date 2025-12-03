import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckDto {
    @ApiProperty({ example: 'healthy', description: 'Health status' })
    status: 'healthy' | 'unhealthy';

    @ApiProperty({ example: 'Database connection successful', description: 'Health check message', required: false })
    message?: string;

    @ApiProperty({ example: '2023-05-10T10:30:00.000Z', description: 'Timestamp of the health check' })
    timestamp: string;
}

export class SystemStatusResponseDto {
    @ApiProperty({ example: 'healthy', description: 'Overall system status' })
    status: string;

    @ApiProperty({ example: '2023-05-10T10:30:00.000Z', description: 'Current timestamp' })
    timestamp: string;

    @ApiProperty({
        example: {
            process: 12345.67,
            system: 567890.12,
            startTime: '2023-05-10T10:00:00.000Z'
        },
        description: 'Uptime information'
    })
    uptime: {
        process: number;
        system: number;
        startTime: string;
    };

    @ApiProperty({
        example: {
            rss: 123456789,
            heapTotal: 98765432,
            heapUsed: 45678912,
            external: 1234567
        },
        description: 'Memory usage information'
    })
    memory: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
    };

    @ApiProperty({
        example: {
            loadAverage: [0.1, 0.2, 0.3],
            cores: 8
        },
        description: 'CPU information'
    })
    cpu: {
        loadAverage: number[];
        cores: number;
    };

    @ApiProperty({
        example: {
            platform: 'linux',
            arch: 'x64',
            hostname: 'server-hostname'
        },
        description: 'System information'
    })
    system: {
        platform: string;
        arch: string;
        hostname: string;
    };

    @ApiProperty({
        example: {
            version: '1.0.0',
            nodeVersion: 'v18.16.0',
            environment: 'production'
        },
        description: 'Application information'
    })
    app: {
        version: string;
        nodeVersion: string;
        environment: string;
    };

    @ApiProperty({
        type: HealthCheckDto,
        description: 'Database health check'
    })
    healthChecks: {
        database: HealthCheckDto;
    };
}
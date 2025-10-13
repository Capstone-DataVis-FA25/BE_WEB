import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SystemStatusResponseDto } from './dto/system-status.dto';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
    constructor(private readonly systemService: SystemService) { }

    @Get('status')
    @ApiOperation({ summary: 'Get system status', description: 'Returns the current status of the system including uptime, health checks, and version information.' })
    @ApiResponse({
        status: 200,
        description: 'System status retrieved successfully',
        type: SystemStatusResponseDto
    })
    @ApiResponse({ status: 503, description: 'System is unhealthy' })
    async getSystemStatus(): Promise<SystemStatusResponseDto> {
        return await this.systemService.getSystemStatus();
    }
}
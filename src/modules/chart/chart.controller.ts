import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ChartService } from './chart.service';
import { CreateChartDto } from './dto/create-chart.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';

@ApiTags('charts')
@Controller('charts')
@ApiBearerAuth()
@UseGuards(JwtAccessTokenGuard)
export class ChartController {
    constructor(private readonly chartService: ChartService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new chart' })
    @ApiResponse({ status: 201, description: 'Chart created successfully' })
    @ApiBody({ type: CreateChartDto })
    create(@Body() createChartDto: CreateChartDto, @Request() req: AuthRequest) {
        return this.chartService.create(createChartDto, req.user.userId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all charts for the authenticated user' })
    @ApiResponse({ status: 200, description: 'List of charts retrieved successfully' })
    findAll(@Request() req: AuthRequest) {
        return this.chartService.findAll(req.user.userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific chart by ID' })
    @ApiResponse({ status: 200, description: 'Chart retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Chart not found' })
    findOne(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.chartService.findOne(id, req.user.userId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a chart' })
    @ApiResponse({ status: 200, description: 'Chart deleted successfully' })
    @ApiResponse({ status: 404, description: 'Chart not found' })
    remove(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.chartService.remove(id, req.user.userId);
    }
}
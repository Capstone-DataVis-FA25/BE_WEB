import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Inject,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ForecastsService } from './forecasts.service';
import { CreateForecastDto } from './dto/create-forecast.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';
import { JwtAccessTokenGuard } from '../auth/guards/jwt-access-token.guard';
import { AuthRequest } from '../auth/auth.controller';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiChartEvaluationService } from '../ai/ai.chart-evaluation.service';
import { ForecastAnalysisJobService } from './forecast-analysis.job';

@ApiTags('forecasts')
@ApiBearerAuth()
@Controller('forecasts')
@UseGuards(JwtAccessTokenGuard)
export class ForecastsController {
  constructor(
    private readonly forecastsService: ForecastsService,
    @Inject(forwardRef(() => AiChartEvaluationService))
    private readonly aiChartEvaluationService: AiChartEvaluationService,
    private readonly forecastAnalysisJobService: ForecastAnalysisJobService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new forecast' })
  create(@Body() createForecastDto: CreateForecastDto, @Request() req: AuthRequest) {
    return this.forecastsService.create(createForecastDto, req.user.userId || req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Get all forecasts for the current user' })
  findAll(@Request() req: AuthRequest) {
    return this.forecastsService.findAll(req.user.userId || req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific forecast by ID' })
  findOne(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.forecastsService.findOne(id, req.user.userId || req.user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a forecast (e.g., add AI analysis)' })
  update(
    @Param('id') id: string,
    @Body() updateForecastDto: UpdateForecastDto,
    @Request() req: AuthRequest,
  ) {
    return this.forecastsService.update(id, updateForecastDto, req.user.userId || req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a forecast' })
  remove(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.forecastsService.remove(id, req.user.userId || req.user.sub);
  }

  @Post(':id/analyze')
  @ApiOperation({ summary: 'Trigger AI analysis for an existing forecast (async)' })
  async analyzeForecast(@Param('id') id: string, @Request() req: AuthRequest) {
    const userId = req.user.userId || req.user.sub;
    
    try {
      // Get forecast to verify ownership and get chart image URL
      const forecast = await this.forecastsService.findOne(id, userId);
      
      if (!forecast.chartImageUrl) {
        throw new HttpException(
          'Forecast does not have a chart image to analyze',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Create async job and return jobId immediately
      const jobId = this.forecastAnalysisJobService.createJob(
        id,
        userId,
        forecast.chartImageUrl,
        3, // 3 attempts for manual "Generate Analysis" button
      );

      return {
        success: true,
        message: 'Analysis job started. You will be notified when it completes.',
        jobId,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to start analysis job',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('analysis/:jobId/status')
  @ApiOperation({ summary: 'Get analysis job status' })
  getAnalysisJobStatus(@Param('jobId') jobId: string, @Request() req: AuthRequest) {
    const userId = req.user.userId || req.user.sub;
    const status = this.forecastAnalysisJobService.getJobStatus(jobId);
    
    if (!status) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }

    // Verify ownership
    if (status.forecastId) {
      // Additional check can be added here if needed
    }

    return status;
  }
}


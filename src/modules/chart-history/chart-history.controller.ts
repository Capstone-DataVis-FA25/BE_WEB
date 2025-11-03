import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ChartHistoryService } from './chart-history.service';
import { RestoreChartDto, ChartHistoryResponseDto } from './dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';

@ApiTags('chart-history')
@Controller('chart-history')
@ApiBearerAuth()
@UseGuards(JwtAccessTokenGuard)
export class ChartHistoryController {
  constructor(private readonly chartHistoryService: ChartHistoryService) {}

  @Get('chart/:chartId')
  @ApiOperation({
    summary: 'Get all history versions of a chart',
    description:
      'Retrieve all historical versions of a specific chart. The chart must belong to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of chart history retrieved successfully',
    type: [ChartHistoryResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - chart access denied',
  })
  @ApiResponse({ status: 404, description: 'Chart not found' })
  @ApiParam({
    name: 'chartId',
    description: 'ID of the chart to get history for',
  })
  async getChartHistory(
    @Param('chartId') chartId: string,
    @Request() req: AuthRequest,
  ) {
    return this.chartHistoryService.getChartHistory(chartId, req.user.userId);
  }

  @Get('chart/:chartId/count')
  @ApiOperation({
    summary: 'Get count of history versions',
    description:
      'Get the total number of history versions for a specific chart.',
  })
  @ApiResponse({
    status: 200,
    description: 'History count retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - chart access denied',
  })
  @ApiResponse({ status: 404, description: 'Chart not found' })
  @ApiParam({
    name: 'chartId',
    description: 'ID of the chart to count history for',
  })
  async getHistoryCount(
    @Param('chartId') chartId: string,
    @Request() req: AuthRequest,
  ) {
    const count = await this.chartHistoryService.getHistoryCount(
      chartId,
      req.user.userId,
    );
    return { count };
  }

  @Get(':historyId')
  @ApiOperation({
    summary: 'Get a specific history version',
    description:
      'Retrieve details of a specific historical version by its ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'History record retrieved successfully',
    type: ChartHistoryResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - history access denied',
  })
  @ApiResponse({ status: 404, description: 'History record not found' })
  @ApiParam({
    name: 'historyId',
    description: 'ID of the history record to retrieve',
  })
  async getHistoryById(
    @Param('historyId') historyId: string,
    @Request() req: AuthRequest,
  ) {
    return this.chartHistoryService.getHistoryById(historyId, req.user.userId);
  }

  @Post('chart/:chartId/restore')
  @ApiOperation({
    summary: 'Restore chart to a previous version',
    description:
      'Restore a chart to a specific historical version. The current version will be saved to history before restoring.',
  })
  @ApiResponse({
    status: 200,
    description: 'Chart restored successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid history ID or chart mismatch',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - chart access denied',
  })
  @ApiResponse({ status: 404, description: 'Chart or history record not found' })
  @ApiParam({
    name: 'chartId',
    description: 'ID of the chart to restore',
  })
  @ApiBody({ type: RestoreChartDto })
  async restoreFromHistory(
    @Param('chartId') chartId: string,
    @Body() restoreDto: RestoreChartDto,
    @Request() req: AuthRequest,
  ) {
    return this.chartHistoryService.restoreFromHistory(
      chartId,
      restoreDto.historyId,
      req.user.userId,
      restoreDto.changeNote,
    );
  }

  @Get('chart/:chartId/compare/:historyId')
  @ApiOperation({
    summary: 'Compare current version with a historical version',
    description:
      'Compare the current chart configuration with a specific historical version to see what changed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Version comparison retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - chart access denied',
  })
  @ApiResponse({ status: 404, description: 'Chart or history record not found' })
  @ApiParam({
    name: 'chartId',
    description: 'ID of the chart to compare',
  })
  @ApiParam({
    name: 'historyId',
    description: 'ID of the history record to compare with',
  })
  async compareVersions(
    @Param('chartId') chartId: string,
    @Param('historyId') historyId: string,
    @Request() req: AuthRequest,
  ) {
    return this.chartHistoryService.compareVersions(
      chartId,
      historyId,
      req.user.userId,
    );
  }

  @Delete(':historyId')
  @ApiOperation({
    summary: 'Delete a history record',
    description:
      'Delete a specific history record. Use with caution as this action cannot be undone.',
  })
  @ApiResponse({
    status: 200,
    description: 'History record deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - history access denied',
  })
  @ApiResponse({ status: 404, description: 'History record not found' })
  @ApiParam({
    name: 'historyId',
    description: 'ID of the history record to delete',
  })
  async deleteHistory(
    @Param('historyId') historyId: string,
    @Request() req: AuthRequest,
  ) {
    return this.chartHistoryService.deleteHistory(historyId, req.user.userId);
  }
}

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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { ChartsService } from './charts.service';
import { CreateChartDto } from './dto/create-chart.dto';
import { UpdateChartDto } from './dto/update-chart.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';

@ApiTags('charts')
@Controller('charts')
@ApiBearerAuth()
@UseGuards(JwtAccessTokenGuard)
export class ChartsController {
    constructor(private readonly chartsService: ChartsService) { }

    @Post()
    @ApiOperation({
        summary: 'Create a new chart',
        description: 'Create a new chart for a specific dataset. The dataset must belong to the authenticated user.'
    })
    @ApiResponse({ status: 201, description: 'Chart created successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - dataset access denied' })
    @ApiResponse({ status: 404, description: 'Dataset not found' })
    @ApiBody({ type: CreateChartDto })
    create(@Body() createChartDto: CreateChartDto, @Request() req: AuthRequest) {
        return this.chartsService.create(createChartDto, req.user.userId);
    }

    @Get()
    @ApiOperation({
        summary: 'Get all charts for the authenticated user',
        description: 'Retrieve all charts created by the authenticated user with their datasets and decrypted data headers, ordered by creation date (newest first).'
    })
    @ApiResponse({ status: 200, description: 'List of charts retrieved successfully' })
    findAll(@Request() req: AuthRequest) {
        return this.chartsService.findAll(req.user.userId);
    }

    @Get('dataset/:datasetId')
    @ApiOperation({
        summary: 'Get all charts for a specific dataset',
        description: 'Retrieve all charts created from a specific dataset with their datasets and decrypted data headers. The dataset must belong to the authenticated user.'
    })
    @ApiResponse({ status: 200, description: 'List of charts for dataset retrieved successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - dataset access denied' })
    @ApiResponse({ status: 404, description: 'Dataset not found' })
    @ApiParam({ name: 'datasetId', description: 'ID of the dataset to get charts for' })
    findByDataset(@Param('datasetId') datasetId: string, @Request() req: AuthRequest) {
        return this.chartsService.findByDataset(datasetId, req.user.userId);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Get chart detail by ID',
        description: 'Retrieve a chart by its ID along with the associated dataset and decrypted data headers. The chart must belong to the authenticated user.'
    })
    @ApiResponse({ status: 200, description: 'Chart detail retrieved successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - chart access denied' })
    @ApiResponse({ status: 404, description: 'Chart not found' })
    @ApiParam({ name: 'id', description: 'ID of the chart to retrieve' })
    findOne(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.chartsService.findOne(id, req.user.userId);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Update a chart',
        description: 'Update a chart by its ID. The chart must belong to the authenticated user.'
    })
    @ApiResponse({ status: 200, description: 'Chart updated successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - chart access denied' })
    @ApiResponse({ status: 404, description: 'Chart not found' })
    @ApiParam({ name: 'id', description: 'ID of the chart to update' })
    @ApiBody({ type: UpdateChartDto })
    update(
        @Param('id') id: string,
        @Body() updateChartDto: UpdateChartDto,
        @Request() req: AuthRequest
    ) {
        return this.chartsService.update(id, updateChartDto, req.user.userId);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Delete a chart',
        description: 'Delete a chart by its ID. The chart must belong to the authenticated user.'
    })
    @ApiResponse({ status: 200, description: 'Chart deleted successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - chart access denied' })
    @ApiResponse({ status: 404, description: 'Chart not found' })
    @ApiParam({ name: 'id', description: 'ID of the chart to delete' })
    remove(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.chartsService.remove(id, req.user.userId);
    }
}
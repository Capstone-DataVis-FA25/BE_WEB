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
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ChartNotesService } from './chart-notes.service';
import { CreateChartNoteDto, UpdateChartNoteDto } from './dto';
import { JwtAccessTokenGuard } from '../auth/guards/jwt-access-token.guard';

@ApiTags('Chart Notes')
@ApiBearerAuth()
@Controller('chart-notes')
@UseGuards(JwtAccessTokenGuard)
export class ChartNotesController {
  constructor(private readonly chartNotesService: ChartNotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new chart note' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Chart note created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only create notes for your own charts',
  })
  async create(@Body() createChartNoteDto: CreateChartNoteDto, @Request() req) {
    const note = await this.chartNotesService.create(createChartNoteDto, req.user.userId);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Chart note created successfully',
      data: note,
    };
  }

  @Get('chart/:chartId')
  @ApiOperation({ summary: 'Get all notes for a specific chart' })
  @ApiParam({ name: 'chartId', description: 'Chart ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chart notes retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only view notes from your own charts',
  })
  async findAllByChart(@Param('chartId') chartId: string, @Request() req) {
    const notes = await this.chartNotesService.findAllByChart(chartId, req.user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Chart notes retrieved successfully',
      data: notes,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific chart note by ID' })
  @ApiParam({ name: 'id', description: 'Chart note ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chart note retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart note not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only view notes from your own charts or your own notes',
  })
  async findOne(@Param('id') id: string, @Request() req) {
    const note = await this.chartNotesService.findOne(id, req.user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Chart note retrieved successfully',
      data: note,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a chart note' })
  @ApiParam({ name: 'id', description: 'Chart note ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chart note updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart note not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only update your own notes',
  })
  async update(
    @Param('id') id: string,
    @Body() updateChartNoteDto: UpdateChartNoteDto,
    @Request() req,
  ) {
    const note = await this.chartNotesService.update(id, updateChartNoteDto, req.user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Chart note updated successfully',
      data: note,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a chart note (hard delete)' })
  @ApiParam({ name: 'id', description: 'Chart note ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chart note deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart note not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only delete your own notes or notes from your charts',
  })
  async remove(@Param('id') id: string, @Request() req) {
    const result = await this.chartNotesService.remove(id, req.user.userId);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  @Patch(':id/toggle-completed')
  @ApiOperation({ summary: 'Toggle completed status of a chart note' })
  @ApiParam({ name: 'id', description: 'Chart note ID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chart note status toggled successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chart note not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'You can only update your own notes',
  })
  async toggleCompleted(@Param('id') id: string, @Request() req) {
    const note = await this.chartNotesService.toggleCompleted(id, req.user.userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Chart note status toggled successfully',
      data: note,
    };
  }
}

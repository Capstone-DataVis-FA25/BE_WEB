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
    UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { DatasetsService } from './datasets.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';
import { PayloadSizeLimitPipe } from '../../pipes/payload-size-limit.pipe';
import { AppConstants } from '../../constant/app.constants';

@ApiTags('datasets')
@Controller('datasets')
@ApiBearerAuth()
@UseGuards(JwtAccessTokenGuard)
export class DatasetsController {
    constructor(private readonly datasetsService: DatasetsService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new dataset' })
    @ApiResponse({ status: 201, description: 'Dataset created successfully' })
    @ApiBody({ type: CreateDatasetDto })
    @UsePipes(new PayloadSizeLimitPipe(AppConstants.DATASET_PAYLOAD_MAX_SIZE))
    create(@Body() createDatasetDto: CreateDatasetDto, @Request() req: AuthRequest) {
        return this.datasetsService.create(createDatasetDto, req.user.userId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all datasets for the authenticated user' })
    @ApiResponse({ status: 200, description: 'List of datasets retrieved successfully' })
    findAll(@Request() req: AuthRequest) {
        return this.datasetsService.findAll(req.user.userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific dataset by ID' })
    @ApiResponse({ status: 200, description: 'Dataset retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Dataset not found' })
    findOne(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.datasetsService.findOne(id, req.user.userId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a dataset' })
    @ApiResponse({ status: 200, description: 'Dataset updated successfully' })
    @ApiResponse({ status: 404, description: 'Dataset not found' })
    @ApiBody({ type: UpdateDatasetDto })
    @UsePipes(new PayloadSizeLimitPipe(AppConstants.DATASET_PAYLOAD_MAX_SIZE))
    update(
        @Param('id') id: string,
        @Body() updateDatasetDto: UpdateDatasetDto,
        @Request() req: AuthRequest,
    ) {
        return this.datasetsService.update(id, updateDatasetDto, req.user.userId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a dataset' })
    @ApiResponse({ status: 200, description: 'Dataset deleted successfully' })
    @ApiResponse({ status: 404, description: 'Dataset not found' })
    remove(@Param('id') id: string, @Request() req: AuthRequest) {
        return this.datasetsService.remove(id, req.user.userId);
    }
}

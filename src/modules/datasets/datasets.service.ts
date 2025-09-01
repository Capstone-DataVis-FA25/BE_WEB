import { Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';

@Injectable()
export class DatasetsService {
    constructor(private readonly prismaService: PrismaService) { }

    async create(createDatasetDto: CreateDatasetDto, userId: string) {
        const { data, name, description } = createDatasetDto;

        // Only validate what DTO doesn't cover - consistent column count
        const firstRowLength = data[0].length;
        const hasInconsistentColumns = data.some(row =>
            row.length !== firstRowLength
        );

        if (hasInconsistentColumns) {
            throw new BadRequestException('All rows must have the same number of columns');
        }

        // Database operation with error handling
        try {
            return await this.prismaService.prisma.dataset.create({
                data: {
                    userId,
                    data,
                    name,
                    description: description || null,
                    rowCount: data.length,
                    columnCount: firstRowLength,
                },
                omit: {
                    data: true
                }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                // Unique constraint violation
                throw new HttpException('A dataset with this name already exists', HttpStatus.CONFLICT);
            }
            if (error.code === 'P2003') {
                throw new BadRequestException('Invalid user ID');
            }
            throw new BadRequestException(`Failed to create dataset: ${error.message}`);
        }
    }

    async findAll(userId: string) {
        // TODO: Implement get all datasets for user
        // Return datasets belonging to the user
        throw new HttpException('Method not implemented', HttpStatus.NOT_IMPLEMENTED);
    }

    async findOne(id: string, userId: string) {
        // TODO: Implement get dataset by ID
        // Check if dataset exists and belongs to user
        throw new HttpException('Method not implemented', HttpStatus.NOT_IMPLEMENTED);
    }

    async update(id: string, updateDatasetDto: UpdateDatasetDto, userId: string) {
        // TODO: Implement dataset update logic
        // Check ownership and update dataset
        throw new HttpException('Method not implemented', HttpStatus.NOT_IMPLEMENTED);
    }

    async remove(id: string, userId: string) {
        // TODO: Implement dataset deletion logic
        // Check ownership and delete dataset   
        throw new HttpException('Method not implemented', HttpStatus.NOT_IMPLEMENTED);
    }

    // Helper method to validate dataset ownership
    private async validateOwnership(datasetId: string, userId: string) {
        const dataset = await this.prismaService.prisma.dataset.findUnique({
            where: { id: datasetId },
        });

        if (!dataset) {
            throw new NotFoundException('Dataset not found');
        }

        if (dataset.userId !== userId) {
            throw new ForbiddenException('You do not have access to this dataset');
        }

        return dataset;
    }
}

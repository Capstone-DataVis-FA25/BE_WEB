import { Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';

@Injectable()
export class DatasetsService {
    constructor(private readonly prismaService: PrismaService) { }

    async create(createDatasetDto: CreateDatasetDto, userId: string) {
        const { data, name, description } = createDatasetDto;

        // Database operation with error handling
        try {
            return await this.prismaService.prisma.dataset.create({
                data: {
                    userId,
                    data,
                    name,
                    description: description || null,
                    rowCount: data.length,
                    columnCount: data[0].length,
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    rowCount: true,
                    columnCount: true,
                    createdAt: true,
                    updatedAt: true,
                    userId: true,
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
        try {
            const datasets = await this.prismaService.prisma.dataset.findMany({
                where: { userId },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    rowCount: true,
                    columnCount: true,
                    createdAt: true,
                    updatedAt: true,
                    userId: true,
                },
                orderBy: { createdAt: 'desc' }
            });
            return datasets;
        } catch (error) {
            throw new BadRequestException(`Failed to fetch datasets: ${error.message}`);
        }
    }

    async findOne(id: string, userId: string) {
        try {
            const dataset = await this.prismaService.prisma.dataset.findUnique({
                where: { id },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        }
                    }
                }
            });

            if (!dataset) {
                throw new NotFoundException('Dataset not found');
            }

            if (dataset.userId !== userId) {
                throw new ForbiddenException('You do not have access to this dataset');
            }

            return dataset;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            throw new BadRequestException(`Failed to fetch dataset: ${error.message}`);
        }
    }

    async update(id: string, updateDatasetDto: UpdateDatasetDto, userId: string) {
        try {
            // First validate ownership
            await this.validateOwnership(id, userId);

            const { data, name, description } = updateDatasetDto;
            const updateData: any = {};

            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;
            if (data !== undefined) {
                updateData.data = data;
                updateData.rowCount = data.length;
                updateData.columnCount = data[0]?.length || 0;
            }

            const updatedDataset = await this.prismaService.prisma.dataset.update({
                where: { id },
                data: updateData,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    rowCount: true,
                    columnCount: true,
                    createdAt: true,
                    updatedAt: true,
                    userId: true,
                }
            });

            return updatedDataset;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2002') {
                throw new HttpException('A dataset with this name already exists', HttpStatus.CONFLICT);
            }
            throw new BadRequestException(`Failed to update dataset: ${error.message}`);
        }
    }

    async remove(id: string, userId: string) {
        try {
            // First validate ownership
            await this.validateOwnership(id, userId);

            await this.prismaService.prisma.dataset.delete({
                where: { id }
            });

            return { message: 'Dataset deleted successfully' };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            throw new BadRequestException(`Failed to delete dataset: ${error.message}`);
        }
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

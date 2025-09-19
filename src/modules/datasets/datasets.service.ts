import { Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import { Prisma } from '@prisma/client';
import { KmsService } from '../kms/kms.service';

@Injectable()
export class DatasetsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly kmsService: KmsService
    ) { }

  async create(createDatasetDto: CreateDatasetDto, userId: string) {
    const { headers, name, description } = createDatasetDto;

    // Calculate rowCount and columnCount from headers
    const rowCount = headers.length > 0 ? headers[0].data.length : 0;
    const columnCount = headers.length;

    // Database operation with error handling
    try {
      return await this.prismaService.prisma.dataset.create({
        data: {
          userId,
          name,
          description: description || null,
          rowCount,
          columnCount,
          headers: {
            create: headers.map((header) => ({
              name: header.name,
              type: header.type,
              index: header.index,
              data: header.data,
            })),
          },
        },
        include: {
          headers: {
            orderBy: {
              index: "asc",
            },
          },
        },
      });
    } catch (error) {
      if (error.code === "P2002") {
        // Unique constraint violation
        throw new HttpException(
          "A dataset with this name already exists",
          HttpStatus.CONFLICT
        );
      }
      if (error.code === "P2003") {
        throw new BadRequestException("Invalid user ID");
      }
      throw new BadRequestException(
        `Failed to create dataset: ${error.message}`
      );
    }
  }

  async findAll(userId: string) {
    try {
      const datasets = await this.prismaService.prisma.dataset.findMany({
        where: { userId },
        include: {
          headers: {
            orderBy: {
              index: "asc",
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return datasets;
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch datasets: ${error.message}`
      );
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
            },
          },
          headers: {
            orderBy: {
              index: "asc",
            },
          },
        },
      });

      if (!dataset) {
        throw new NotFoundException("Dataset not found");
      }

      if (dataset.userId !== userId) {
        throw new ForbiddenException("You do not have access to this dataset");
      }

      return dataset;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to fetch dataset: ${error.message}`
      );
    }
  }

  async update(id: string, updateDatasetDto: UpdateDatasetDto, userId: string) {
    try {
      // First validate ownership
      await this.validateOwnership(id, userId);

      const { headers, name, description } = updateDatasetDto;
      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      if (headers !== undefined) {
        // Calculate new rowCount and columnCount from headers
        const rowCount = headers.length > 0 ? headers[0].data.length : 0;
        const columnCount = headers.length;

        // Encrypt each header's data
        const encryptedHeaders = await Promise.all(
            headers.map(async (header) => {
                // Convert data array to JSON string for encryption
                const dataString = JSON.stringify(header.data);

                // Encrypt the data using KMS
                const encryptionResult = await this.kmsService.encryptData(dataString);

                return {
                    name: header.name,
                    type: header.type,
                    index: header.index,
                    encryptedData: encryptionResult.encryptedData,
                    iv: encryptionResult.iv,
                    authTag: encryptionResult.authTag,
                    encryptedDataKey: encryptionResult.encryptedDataKey,
                };
            })
        );

        // Database operation with error handling
        try {
            return await this.prismaService.prisma.dataset.create({
                data: {
                    userId,
                    name,
                    description: description || null,
                    rowCount,
                    columnCount,
                    headers: {
                        create: encryptedHeaders
                    }
                },
                include: {
                    headers: {
                        orderBy: {
                            index: 'asc'
                        }
                    }
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
                    // Don't include headers for performance
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
                    },
                    headers: {
                        orderBy: {
                            index: 'asc'
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

            // Decrypt headers
            const decryptedDataset = {
                ...dataset,
                headers: await Promise.all(
                    dataset.headers.map(async (header) => {
                        const decryptedDataString = await this.kmsService.decryptData(
                            header.encryptedData,
                            header.encryptedDataKey,
                            header.iv,
                            header.authTag
                        );

                        const decryptedData = JSON.parse(decryptedDataString);

                        return {
                            id: header.id,
                            datasetId: header.datasetId,
                            name: header.name,
                            type: header.type,
                            index: header.index,
                            data: decryptedData,
                        };
                    })
                )
            };

            return decryptedDataset;
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

            const { headers, name, description } = updateDatasetDto;
            const updateData: Prisma.DatasetUpdateInput = {};

            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;

            if (headers !== undefined) {
                // Calculate new rowCount and columnCount from headers
                const rowCount = headers.length > 0 ? headers[0].data.length : 0;
                const columnCount = headers.length;

                updateData.rowCount = rowCount;
                updateData.columnCount = columnCount;

                // Encrypt each header's data
                const encryptedHeaders = await Promise.all(
                    headers.map(async (header) => {
                        // Convert data array to JSON string for encryption
                        const dataString = JSON.stringify(header.data);

                        // Encrypt the data using KMS
                        const encryptionResult = await this.kmsService.encryptData(dataString);

                        return {
                            name: header.name,
                            type: header.type,
                            index: header.index,
                            encryptedData: encryptionResult.encryptedData,
                            iv: encryptionResult.iv,
                            authTag: encryptionResult.authTag,
                            encryptedDataKey: encryptionResult.encryptedDataKey,
                        };
                    })
                );

                // Delete existing headers and create new ones
                updateData.headers = {
                    deleteMany: {},
                    create: encryptedHeaders
                };
            }

            const updatedDataset = await this.prismaService.prisma.dataset.update({
                where: { id },
                data: updateData,
                include: {
                    headers: {
                        orderBy: {
                            index: 'asc'
                        }
                    }
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

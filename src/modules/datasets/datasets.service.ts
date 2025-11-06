import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateDatasetDto, CreateDataHeaderDto } from "./dto/create-dataset.dto";
import { UpdateDatasetDto } from "./dto/update-dataset.dto";
import { Prisma } from "@prisma/client";
import { KmsService } from "../kms/kms.service";

@Injectable()
export class DatasetsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly kmsService: KmsService
  ) { }

  async create(createDatasetDto: CreateDatasetDto, userId: string) {
    const { headers, name, description, thousandsSeparator, decimalSeparator } = createDatasetDto;

    // Validate header names are unique
    const headerNames = headers.map(h => h.name);
    const duplicateNames = headerNames.filter((name, index) => headerNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      throw new BadRequestException(`Duplicate column names found: ${[...new Set(duplicateNames)].join(', ')}`);
    }

    // Validate data types in headers
   // console.log('🔍 Validating headers:', headers.map(h => ({ name: h.name, type: h.type, dataLength: h.data.length })));
    const validation = this.validateHeaderDataTypes(headers);
   // console.log('🔍 Validation result:', validation);
    if (!validation.isValid) {
      throw new BadRequestException(`Data type validation failed: ${validation.errors.join(', ')}`);
    }

    // Calculate rowCount and columnCount from headers
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
          dateFormat: header.dateFormat ?? "YYYY-MM-DD",
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
          thousandsSeparator: thousandsSeparator || ",",
          decimalSeparator: decimalSeparator || ".",
          headers: {
            create: encryptedHeaders,
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
        select: {
          id: true,
          name: true,
          description: true,
          rowCount: true,
          columnCount: true,
          thousandsSeparator: true,
          decimalSeparator: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          // Don't include headers for performance
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

      // Headers are automatically decrypted by the Prisma extension
      // The 'data' field is now available on each header
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

      const { headers, name, description, thousandsSeparator, decimalSeparator } = updateDatasetDto;
      const updateData: Prisma.DatasetUpdateInput = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (thousandsSeparator !== undefined) updateData.thousandsSeparator = thousandsSeparator;
      if (decimalSeparator !== undefined) updateData.decimalSeparator = decimalSeparator;
      // dataset-level dateFormat removed; use per-header dateFormat instead

      if (headers !== undefined) {
        // Validate header names are unique
        const headerNames = headers.map(h => h.name);
        const duplicateNames = headerNames.filter((name, index) => headerNames.indexOf(name) !== index);
        if (duplicateNames.length > 0) {
          throw new BadRequestException(`Duplicate column names found: ${[...new Set(duplicateNames)].join(', ')}`);
        }

        // Validate data types in headers
        const validation = this.validateHeaderDataTypes(headers);
        if (!validation.isValid) {
          throw new BadRequestException(`Data type validation failed: ${validation.errors.join(', ')}`);
        }

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
              dateFormat: header.dateFormat ?? "YYYY-MM-DD",
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
          create: encryptedHeaders,
        };
      }

      const updatedDataset = await this.prismaService.prisma.dataset.update({
        where: { id },
        data: updateData,
        include: {
          headers: {
            orderBy: {
              index: "asc",
            },
          },
        },
      });

      return updatedDataset;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      if (error.code === "P2002") {
        throw new HttpException(
          "A dataset with this name already exists",
          HttpStatus.CONFLICT
        );
      }
      throw new BadRequestException(
        `Failed to update dataset: ${error.message}`
      );
    }
  }

  async remove(id: string, userId: string) {
    try {
      // First validate ownership
      await this.validateOwnership(id, userId);

      await this.prismaService.prisma.dataset.delete({
        where: { id },
      });

      return { message: "Dataset deleted successfully" };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to delete dataset: ${error.message}`
      );
    }
  }

  // Helper method to validate dataset ownership
  public async validateOwnership(datasetId: string, userId: string) {
    const dataset = await this.prismaService.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException("Dataset not found");
    }

    if (dataset.userId !== userId) {
      throw new ForbiddenException("You do not have access to this dataset");
    }

    return dataset;
  }

  // Helper method to validate data types in headers
  private validateHeaderDataTypes(headers: CreateDataHeaderDto[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const header of headers) {
      if (header.type === 'number') {
        // Validate that all data values are valid numbers
        for (let i = 0; i < header.data.length; i++) {
          const value = header.data[i];
          if (value !== null && value !== undefined) {
            if (typeof value !== 'number' || isNaN(value)) {
              errors.push(`Column "${header.name}" at row ${i + 1}: Expected number but got ${typeof value} (${value})`);
            }
          }
        }
      } else if (header.type === 'date') {
        // Validate that all data values are valid ISO date strings
        for (let i = 0; i < header.data.length; i++) {
          const value = header.data[i];
          if (value !== null && value !== undefined) {
            if (typeof value !== 'string') {
              errors.push(`Column "${header.name}" at row ${i + 1}: Expected string but got ${typeof value} (${value})`);
            } else {
              // Check if it's a valid ISO date string
              const date = new Date(value);
              if (isNaN(date.getTime())) {
                errors.push(`Column "${header.name}" at row ${i + 1}: Invalid date format "${value}". Expected ISO format (YYYY-MM-DD)`);
              } else {
                // Check if the string matches ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
                const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
                const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
                if (!isoDateRegex.test(value) && !isoDateTimeRegex.test(value)) {
                  errors.push(`Column "${header.name}" at row ${i + 1}: Date "${value}" is not in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)`);
                }
              }
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

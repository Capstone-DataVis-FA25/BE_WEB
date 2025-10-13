import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChartNoteDto, UpdateChartNoteDto } from './dto';

@Injectable()
export class ChartNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all notes for a specific chart
   */
  async findAllByChart(chartId: string) {
    // Check if chart exists
    const chart = await this.prisma.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chart) {
      throw new NotFoundException(`Chart with ID ${chartId} not found`);
    }

    return this.prisma.prisma.chartNote.findMany({
      where: {
        chartId,
        deletedAt: null, // Only non-deleted notes
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
    * Get a specific note by ID
  */
  async findOne(id: string) {
    const note = await this.prisma.prisma.chartNote.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException(`Chart note with ID ${id} not found`);
    }

    return note;
  }

  /**
   * Create a new chart note
   */
  async create(createChartNoteDto: CreateChartNoteDto, userId: string) {
    const { chartId, content, isCompleted } = createChartNoteDto;

    // Check if chart exists
    const chart = await this.prisma.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chart) {
      throw new NotFoundException(`Chart with ID ${chartId} not found`);
    }

    // Create the note
    const note = await this.prisma.prisma.chartNote.create({
      data: {
        content,
        chartId,
        authorId: userId,
        isCompleted: isCompleted ?? false,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return note;
  }

  /**
   * Update a chart note
   */
  async update(id: string, updateChartNoteDto: UpdateChartNoteDto, userId: string) {
    const note = await this.findOne(id);

    // Check if user is the author
    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only update your own notes');
    }

    const updateData: any = {};
    if (updateChartNoteDto.content !== undefined) {
      updateData.content = updateChartNoteDto.content;
    }
    console.log('updateChartNoteDto: ', updateChartNoteDto.isCompleted)
    if (updateChartNoteDto.isCompleted !== undefined) {
      updateData.isCompleted = updateChartNoteDto.isCompleted;
    }

    const updatedNote = await this.prisma.prisma.chartNote.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedNote;
  }

  /**
   * Delete a chart note (soft delete)
   */
  async remove(id: string, userId: string) {
    const note = await this.findOne(id);

    // Check if user is the author or admin
    if (note.authorId !== userId) {
      // You can add admin check here if needed
      throw new ForbiddenException('You can only delete your own notes');
    }

    // Soft delete
    await this.prisma.prisma.chartNote.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return { message: 'Note deleted successfully' };
  }

  /**
   * Toggle the completed status of a chart note
   */
  async toggleCompleted(id: string, userId: string) {
    const note = await this.findOne(id);

    // Check if user is the author
    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only update your own notes');
    }

    const updatedNote = await this.prisma.prisma.chartNote.update({
      where: { id },
      data: {
        isCompleted: !note.isCompleted,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedNote;
  }

  /**
   * Permanently delete a chart note (hard delete - admin only)
   */
  async removeForever(id: string) {
    const note = await this.prisma.prisma.chartNote.findUnique({
      where: { id },
    });

    if (!note) {
      throw new NotFoundException(`Chart note with ID ${id} not found`);
    }

    await this.prisma.prisma.chartNote.delete({
      where: { id },
    });

    return { message: 'Note permanently deleted' };
  }
}

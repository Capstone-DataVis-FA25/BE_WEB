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
  async findAllByChart(chartId: string, userId: string) {
    // Check if chart exists and belongs to user
    const chart = await this.prisma.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chart) {
      throw new NotFoundException(`Chart with ID ${chartId} not found`);
    }

    if (chart.userId !== userId) {
      throw new ForbiddenException('You can only view notes from your own charts');
    }

    return this.prisma.prisma.chartNote.findMany({
      where: {
        chartId,
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
  async findOne(id: string, userId: string) {
    const note = await this.prisma.prisma.chartNote.findUnique({
      where: {
        id,
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
        chart: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException(`Chart note with ID ${id} not found`);
    }

    // Check if user owns the chart or is the note author
    if (note.chart.userId !== userId && note.authorId !== userId) {
      throw new ForbiddenException('You can only view notes from your own charts or your own notes');
    }

    return note;
  }

  /**
   * Create a new chart note
   */
  async create(createChartNoteDto: CreateChartNoteDto, userId: string) {
    const { chartId, content, isCompleted } = createChartNoteDto;

    const chart = await this.prisma.prisma.chart.findUnique({
      where: { id: chartId },
    });

    if (!chart) {
      throw new NotFoundException(`Chart with ID ${chartId} not found`);
    }

    if (chart.userId !== userId) {
      throw new ForbiddenException('You can only create notes for your own charts');
    }

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
    const note = await this.findOne(id, userId);

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
   * Delete a chart note (hard delete)
   */
  async remove(id: string, userId: string) {
    const note = await this.findOne(id, userId);

    if (note.authorId !== userId && note.chart.userId !== userId) {
      throw new ForbiddenException('You can only delete your own notes or notes from your charts');
    }

    await this.prisma.prisma.chartNote.delete({
      where: { id },
    });

    return { message: 'Note deleted successfully' };
  }

  /**
   * Toggle the completed status of a chart note
   */
  async toggleCompleted(id: string, userId: string) {
    const note = await this.findOne(id, userId);

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
}

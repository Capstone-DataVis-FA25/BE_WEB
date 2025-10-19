import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('admin/activity')
export class ActivityController {
  constructor(private prisma: PrismaService) { }

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    const take = Math.min(parseInt(limit as string, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const skip = (pageNum - 1) * take;

    const where: any = {};
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;

    const [data, total] = await Promise.all([
      this.prisma.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.prisma.activityLog.count({ where }),
    ]);

    // Enhance the data with additional context before sending to frontend
    const enhancedData = data.map(activity => {
      // Parse metadata if it's a string
      let metadata = activity.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          metadata = {};
        }
      }

      // Ensure metadata is an object
      if (!metadata || typeof metadata !== 'object') {
        metadata = {};
      }

      // Add a description field if not present
      if (!metadata['description']) {
        // Create a default description based on action and resource
        let description = activity.action.replace(/_/g, ' ').toLowerCase();
        description = description.charAt(0).toUpperCase() + description.slice(1);

        if (activity.resource) {
          description += ` - ${activity.resource}`;
        }

        return {
          ...activity,
          metadata: {
            ...metadata,
            description
          }
        };
      }
      return {
        ...activity,
        metadata
      };
    });

    return { data: enhancedData, total, page: pageNum, limit: take };
  }
}
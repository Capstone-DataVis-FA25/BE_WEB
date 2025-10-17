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

    return { data, total, page: pageNum, limit: take };
  }
}
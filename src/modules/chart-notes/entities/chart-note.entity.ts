import { ApiProperty } from '@nestjs/swagger';
import { ChartNote } from '@prisma/client';

// Type matching the actual selected fields from service
type PartialUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export class AuthorEntity {
  @ApiProperty({
    description: 'The ID of the author',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the author',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'The avatar URL of the author',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    description: 'The color associated with the author',
    example: '#3b82f6',
    required: false,
  })
  color?: string;

  constructor(user: PartialUser) {
    this.id = user.id;
    this.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    this.avatar = undefined; // Add avatar field to User model if needed
    this.color = this.generateColorFromId(user.id);
  }

  private generateColorFromId(id: string): string {
    // Generate consistent color from user ID
    const colors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#14b8a6', // teal
      '#f97316', // orange
    ];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
}

export class ChartNoteEntity {
  @ApiProperty({
    description: 'The unique identifier of the note',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'The ID of the chart this note belongs to',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  chartId: string;

  @ApiProperty({
    description: 'The content of the note',
    example: 'This chart shows an interesting trend',
  })
  content: string;

  @ApiProperty({
    description: 'The timestamp (ISO string) for compatibility',
    example: '2024-10-08T10:30:00.000Z',
    required: false,
  })
  timestamp?: string;

  @ApiProperty({
    description: 'The author information',
    type: AuthorEntity,
  })
  author: AuthorEntity;

  @ApiProperty({
    description: 'The creation timestamp',
    example: '2024-10-08T10:30:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'The last update timestamp',
    example: '2024-10-08T10:35:00.000Z',
  })
  updatedAt: string;

  constructor(chartNote: ChartNote & { author: PartialUser }) {
    this.id = chartNote.id;
    this.chartId = chartNote.chartId;
    this.content = chartNote.content;
    this.timestamp = chartNote.timestamp || chartNote.createdAt.toISOString();
    this.author = new AuthorEntity(chartNote.author);
    this.createdAt = chartNote.createdAt.toISOString();
    this.updatedAt = chartNote.updatedAt.toISOString();
  }
}

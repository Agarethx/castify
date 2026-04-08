import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Content } from '@prisma/client';
import { CreateContentSchema } from '@castify/validators';
import { Public } from '../auth/decorators/public.decorator';
import { ContentService } from './content.service';

@Controller('channels/:channelId/content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Public()
  @Get()
  findByChannel(@Param('channelId') channelId: string): Promise<Content[]> {
    return this.contentService.findByChannel(channelId);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('channelId') channelId: string, @Param('slug') slug: string): Promise<Content> {
    return this.contentService.findBySlug(channelId, slug);
  }

  @Post()
  create(@Body() body: unknown): Promise<Content> {
    const dto = CreateContentSchema.parse(body);
    return this.contentService.create(dto);
  }
}

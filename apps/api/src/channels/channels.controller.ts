import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { CreateChannelSchema } from '@castify/validators';
import { Public } from '../auth/decorators/public.decorator';
import { ChannelsService } from './channels.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Public()
  @Get()
  findAll(): Promise<Channel[]> {
    return this.channelsService.findAll();
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<Channel> {
    return this.channelsService.findBySlug(slug);
  }

  @Post()
  create(@Body() body: unknown): Promise<Channel> {
    const dto = CreateChannelSchema.parse(body);
    return this.channelsService.create(dto);
  }
}

import { Module } from '@nestjs/common';
import { VodController } from './vod.controller';
import { VodService } from './vod.service';
import { Vod2LiveService } from './vod2live.service';
import { LiveClipsService } from './live-clips.service';

@Module({
  controllers: [VodController],
  providers: [VodService, Vod2LiveService, LiveClipsService],
})
export class VodModule {}

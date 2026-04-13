import { Module } from '@nestjs/common';
import { StreamingController } from './streaming.controller';
import { StreamingService } from './streaming.service';
import { NetworkIntelligenceService } from './network-intelligence.service';
import { MultiStreamingService } from './multistreaming.service';

@Module({
  controllers: [StreamingController],
  providers: [StreamingService, NetworkIntelligenceService, MultiStreamingService],
  exports: [StreamingService],
})
export class StreamingModule {}

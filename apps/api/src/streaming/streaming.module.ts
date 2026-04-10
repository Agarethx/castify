import { Module } from '@nestjs/common';
import { StreamingController } from './streaming.controller';
import { StreamingService } from './streaming.service';
import { NetworkIntelligenceService } from './network-intelligence.service';

@Module({
  controllers: [StreamingController],
  providers: [StreamingService, NetworkIntelligenceService],
  exports: [StreamingService],
})
export class StreamingModule {}

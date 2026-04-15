import { Module } from '@nestjs/common'
import { CastifyVideoController } from './castify-video.controller'
import { CastifyVideoService } from './castify-video.service'

@Module({
  controllers: [CastifyVideoController],
  providers: [CastifyVideoService],
  exports: [CastifyVideoService],
})
export class CastifyVideoModule {}

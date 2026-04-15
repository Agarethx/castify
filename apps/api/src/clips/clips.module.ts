import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ClipsController } from './clips.controller'
import { ClipsService } from './clips.service'

@Module({
  imports: [ConfigModule],   // ConfigService is global but explicit import is cleaner
  controllers: [ClipsController],
  providers: [ClipsService],
})
export class ClipsModule {}

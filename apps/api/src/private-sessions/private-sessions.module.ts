import { Module } from '@nestjs/common'
import { PrivateSessionsController, SessionsPublicController } from './private-sessions.controller'
import { PrivateSessionsService } from './private-sessions.service'

@Module({
  controllers: [PrivateSessionsController, SessionsPublicController],
  providers: [PrivateSessionsService],
  exports: [PrivateSessionsService],
})
export class PrivateSessionsModule {}

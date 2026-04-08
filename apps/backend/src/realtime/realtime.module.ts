import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { REALTIME_BROADCASTER } from '../incidents/interfaces/realtime-broadcaster.interface';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global so the `REALTIME_BROADCASTER` token is visible to every module
 * (`IncidentsService` consumes it via @Optional injection).
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    RealtimeGateway,
    { provide: REALTIME_BROADCASTER, useExisting: RealtimeGateway },
  ],
  exports: [RealtimeGateway, REALTIME_BROADCASTER],
})
export class RealtimeModule {}

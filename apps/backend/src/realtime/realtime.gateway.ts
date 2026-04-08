import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../common/enums';
import { EnvConfig } from '../config/env.config';
import {
  IRealtimeBroadcaster,
  RealtimeEvent,
} from '../incidents/interfaces/realtime-broadcaster.interface';

/**
 * WebSocket gateway powering the dashboard's live feed.
 *
 * Auth: clients pass the JWT access token via the `auth.token` field of the
 * Socket.IO handshake. The gateway verifies the RS256 signature and joins
 * the socket to one room per role + one room per user, so the broadcaster
 * can target groups precisely.
 *
 * Implements `IRealtimeBroadcaster` so it satisfies the IoC token consumed
 * by `IncidentsService` (and any other emitter).
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, IRealtimeBroadcaster
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly env: EnvConfig,
  ) {}

  // ── Connection lifecycle ─────────────────────────────────────────────

  handleConnection(client: Socket): void {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/, '') ??
          '');
      if (!token) throw new UnauthorizedException('Missing token');

      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        publicKey: this.env.jwtPublicKey,
        algorithms: ['RS256'],
      });

      // Reporters do not get the live dashboard feed
      if (payload.role === Role.REPORTER) {
        client.disconnect(true);
        return;
      }

      client.join(`role:${payload.role}`);
      client.join(`user:${payload.sub}`);
      client.data.userId = payload.sub;
      client.data.role = payload.role;

      this.logger.log(`Realtime client connected: ${payload.email} (${payload.role})`);
    } catch (err) {
      this.logger.warn(
        `Rejecting realtime connection: ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data?.userId) {
      this.logger.log(`Realtime client disconnected: ${client.data.userId}`);
    }
  }

  // ── IRealtimeBroadcaster ─────────────────────────────────────────────

  emit(event: RealtimeEvent, payload: Record<string, unknown>): void {
    if (!this.server) {
      this.logger.warn(`Realtime emit before server ready: ${event}`);
      return;
    }
    // Default audience: ADMIN + ENGINEER rooms
    this.server.to('role:ADMIN').emit(event, payload);
    this.server.to('role:SUPER_ADMIN').emit(event, payload);
    this.server.to('role:ENGINEER').emit(event, payload);
  }

  /** Optional helper for targeted broadcasts (e.g. to a single reporter). */
  emitToUser(
    userId: string,
    event: RealtimeEvent,
    payload: Record<string, unknown>,
  ): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}

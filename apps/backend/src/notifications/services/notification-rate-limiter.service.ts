import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationEvent,
} from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../../system-config/system-config.service';

/**
 * DB-backed rate limiter for notifications.
 *
 * Strategy: before sending, check the most recent `notification_logs` row
 * matching `(incidentId, event, channel, recipient)`. If it was sent within
 * the configured window (default 30s), drop the new dispatch. Otherwise
 * insert a new log row and let the send proceed.
 *
 * DB-backed instead of in-memory because the backend may run multiple
 * replicas in production — an in-memory limiter would let dupes leak.
 */
@Injectable()
export class NotificationRateLimiterService {
  private readonly logger = new Logger(NotificationRateLimiterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /**
   * Returns `true` if the notification is allowed (and records the log row),
   * `false` if it was rate-limited.
   */
  async tryConsume(args: {
    incidentId: string;
    event: NotificationEvent;
    channel: NotificationChannel;
    recipient: string;
  }): Promise<boolean> {
    const windowSeconds = await this.systemConfig
      .getNotificationRateLimitSeconds()
      .catch(() => 30);

    const cutoff = new Date(Date.now() - windowSeconds * 1000);

    const recent = await this.prisma.notificationLog.findFirst({
      where: {
        incidentId: args.incidentId,
        event: args.event,
        channel: args.channel,
        recipient: args.recipient,
        sentAt: { gte: cutoff },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (recent) {
      this.logger.log(
        `Rate-limited ${args.event}/${args.channel} → ${args.recipient}`,
      );
      return false;
    }

    await this.prisma.notificationLog.create({
      data: {
        incidentId: args.incidentId,
        event: args.event,
        channel: args.channel,
        recipient: args.recipient,
      },
    });
    return true;
  }
}

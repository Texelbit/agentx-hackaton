import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import {
  NotificationChannel,
  NotificationEvent,
  Role,
} from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';

interface RecipientUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

/**
 * Resolves which active users should receive a given notification.
 *
 * Default policy (when a user has no row in `notification_preferences`):
 *  - ADMIN, ENGINEER → opted IN to all events on EMAIL + SLACK
 *  - REPORTER        → opted IN only to STATUS_DONE on EMAIL
 *
 * A row in `notification_preferences` always wins over the default.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRecipients(
    event: NotificationEvent,
    channel: NotificationChannel,
    incidentReporterId: string,
  ): Promise<RecipientUser[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        role: true,
        notificationPreferences: true,
      },
    });

    return users
      .map<RecipientUser | null>((u) => {
        const pref = u.notificationPreferences.find(
          (p) => p.event === event && p.channel === channel,
        );

        const enabled = pref ? pref.enabled : this.defaultEnabled(
          u.role.name as Role,
          event,
          channel,
          u.id === incidentReporterId,
        );

        if (!enabled) return null;
        return {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: u.role.name as Role,
        };
      })
      .filter((r): r is RecipientUser => r !== null);
  }

  private defaultEnabled(
    role: Role,
    event: NotificationEvent,
    channel: NotificationChannel,
    isReporter: boolean,
  ): boolean {
    if (role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.ENGINEER) {
      return true;
    }

    if (role === Role.REPORTER) {
      // Reporters only get the resolution email for their own incidents
      return (
        isReporter &&
        event === NotificationEvent.STATUS_DONE &&
        channel === NotificationChannel.EMAIL
      );
    }

    return false;
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Single source of every Prisma query that touches the `users` table.
 *
 * The service layer NEVER calls `prisma.user.*` directly — it goes through
 * this repository so the data-access surface is small, mockable and easy to
 * audit. Includes a canonical `userWithRole` shape so callers always get the
 * permissions joined in one round-trip.
 */
export const USER_WITH_ROLE_INCLUDE = {
  role: {
    include: {
      permissions: { include: { permission: true } },
    },
  },
} as const;

export type UserWithRole = Prisma.UserGetPayload<{
  include: typeof USER_WITH_ROLE_INCLUDE;
}>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<UserWithRole[]> {
    return this.prisma.user.findMany({
      include: USER_WITH_ROLE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  findByEmail(email: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  create(data: Prisma.UserCreateInput): Promise<UserWithRole> {
    return this.prisma.user.create({
      data,
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithRole> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  exists(email: string): Promise<boolean> {
    return this.prisma.user
      .findUnique({ where: { email }, select: { id: true } })
      .then((u) => Boolean(u));
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../common/enums';
import { HashUtil } from '../common/utils/hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateNotificationPreferencesDto } from './dto/notification-preference.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';
import {
  USER_WITH_ROLE_INCLUDE,
  UserWithRole,
  UsersRepository,
} from './repositories/users.repository';

/**
 * Business rules around users:
 *
 *  1. SUPER_ADMIN cannot be deactivated by anyone (including themselves).
 *  2. ADMINs cannot deactivate themselves.
 *  3. ADMINs cannot deactivate other ADMINs — only SUPER_ADMIN can, via the
 *     dedicated `users:manage:admins` permission enforced upstream by RBAC.
 *  4. Roles assigned must exist in the `roles` table (validated by FK).
 *  5. `passwordHash` is never returned to the controller layer — every
 *     return path goes through `UserDto.fromEntity`.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<UserDto[]> {
    const list = await this.users.findAll();
    return list.map((u) => UserDto.fromEntity(u));
  }

  async findById(id: string): Promise<UserDto> {
    const user = await this.requireUser(id);
    return UserDto.fromEntity(user);
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    if (await this.users.exists(dto.email)) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }

    const role = await this.prisma.roleEntity.findUnique({
      where: { name: dto.role },
    });
    if (!role) {
      throw new NotFoundException(`Role ${dto.role} does not exist`);
    }

    const passwordHash = await HashUtil.bcryptHash(dto.password);

    const created = await this.users.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      role: { connect: { id: role.id } },
    });

    return UserDto.fromEntity(created);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    await this.requireUser(id);

    const data: Parameters<typeof this.users.update>[1] = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.password !== undefined) {
      data.passwordHash = await HashUtil.bcryptHash(dto.password);
    }

    const updated = await this.users.update(id, data);
    return UserDto.fromEntity(updated);
  }

  /**
   * Deactivates a user according to the SUPER_ADMIN / ADMIN protection rules.
   *
   * @param targetId         user being deactivated
   * @param actorId          user performing the action (from `request.user`)
   * @param actorRole        actor's role
   * @param canManageAdmins  whether the actor holds `users:manage:admins`
   */
  async deactivate(
    targetId: string,
    actorId: string,
    actorRole: Role,
    canManageAdmins: boolean,
  ): Promise<UserDto> {
    const target = await this.requireUser(targetId);

    if (target.isProtected) {
      throw new ForbiddenException('Protected users cannot be deactivated');
    }

    if (target.id === actorId) {
      throw new ForbiddenException('You cannot deactivate yourself');
    }

    const targetRole = target.role.name as Role;

    if (
      (targetRole === Role.ADMIN || targetRole === Role.SUPER_ADMIN) &&
      !canManageAdmins
    ) {
      throw new ForbiddenException(
        'Only a SUPER_ADMIN can deactivate admin users',
      );
    }

    // Defense in depth: an ADMIN can never affect a SUPER_ADMIN.
    if (targetRole === Role.SUPER_ADMIN && actorRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate a SUPER_ADMIN');
    }

    const updated = await this.users.update(targetId, { isActive: false });
    return UserDto.fromEntity(updated);
  }

  async changeRole(
    targetId: string,
    dto: ChangeRoleDto,
    actorId: string,
    canManageAdmins: boolean,
  ): Promise<UserDto> {
    const target = await this.requireUser(targetId);

    if (target.isProtected) {
      throw new ForbiddenException('Protected users cannot change role');
    }
    if (target.id === actorId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const currentRole = target.role.name as Role;
    const newRole = dto.role;

    const touchesAdmin =
      currentRole === Role.ADMIN ||
      currentRole === Role.SUPER_ADMIN ||
      newRole === Role.ADMIN ||
      newRole === Role.SUPER_ADMIN;

    if (touchesAdmin && !canManageAdmins) {
      throw new ForbiddenException(
        'Only a SUPER_ADMIN can grant or revoke admin roles',
      );
    }

    const role = await this.prisma.roleEntity.findUnique({
      where: { name: newRole },
    });
    if (!role) {
      throw new NotFoundException(`Role ${newRole} does not exist`);
    }

    const updated = await this.users.update(targetId, {
      role: { connect: { id: role.id } },
    });
    return UserDto.fromEntity(updated);
  }

  async getNotificationPreferences(
    userId: string,
  ): Promise<{ event: string; channel: string; enabled: boolean }[]> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    return prefs.map((p) => ({
      event: p.event,
      channel: p.channel,
      enabled: p.enabled,
    }));
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<void> {
    await this.prisma.$transaction(
      dto.preferences.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_event_channel: {
              userId,
              event: p.event,
              channel: p.channel,
            },
          },
          update: { enabled: p.enabled },
          create: {
            userId,
            event: p.event,
            channel: p.channel,
            enabled: p.enabled,
          },
        }),
      ),
    );
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async requireUser(id: string): Promise<UserWithRole> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  // exposed for other modules that need the full user (e.g. notifications)
  findByIdRaw(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLE_INCLUDE,
    });
  }
}

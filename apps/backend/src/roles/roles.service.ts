import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RoleDto, UpdateRolePermissionsDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<RoleDto[]> {
    const roles = await this.prisma.roleEntity.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name as Role,
      description: r.description,
      permissions: r.permissions.map((rp) => rp.permission.name),
    }));
  }

  async updatePermissions(
    id: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<RoleDto> {
    const role = await this.prisma.roleEntity.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);

    if (role.name === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'SUPER_ADMIN permissions cannot be modified',
      );
    }

    // Validate every requested permission exists
    const existing = await this.prisma.permission.findMany({
      where: { name: { in: dto.permissions } },
      select: { id: true, name: true },
    });

    if (existing.length !== dto.permissions.length) {
      const found = new Set(existing.map((p) => p.name));
      const missing = dto.permissions.filter((p) => !found.has(p));
      throw new BadRequestException(
        `Unknown permission(s): ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: existing.map((p) => ({ roleId: id, permissionId: p.id })),
      }),
    ]);

    const refreshed = await this.findAll();
    return refreshed.find((r) => r.id === id)!;
  }
}

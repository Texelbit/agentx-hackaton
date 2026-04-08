import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../common/enums';
import { RoleDto, UpdateRolePermissionsDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission(Permission.ROLES_MANAGE)
  @ApiOperation({ summary: 'List all roles with their permissions' })
  @ApiResponse({ status: 200, type: [RoleDto] })
  findAll(): Promise<RoleDto[]> {
    return this.roles.findAll();
  }

  @Patch(':id/permissions')
  @RequirePermission(Permission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Replace the permission set of a role' })
  @ApiResponse({ status: 200, type: RoleDto })
  updatePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<RoleDto> {
    return this.roles.updatePermissions(id, dto);
  }
}

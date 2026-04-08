import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Permission } from '../common/enums';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateNotificationPreferencesDto } from './dto/notification-preference.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, type: [UserDto] })
  findAll(): Promise<UserDto[]> {
    return this.usersService.findAll();
  }

  @Post()
  @RequirePermission(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Create a new user (admin-only)' })
  @ApiResponse({ status: 201, type: UserDto })
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(dto);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: 'Get my notification preferences' })
  getMyPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getNotificationPreferences(user.id);
  }

  @Patch('me/notification-preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update my notification preferences' })
  async updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<void> {
    await this.usersService.updateNotificationPreferences(user.id, dto);
  }

  @Get(':id')
  @RequirePermission(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserDto })
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, type: UserDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequirePermission(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Deactivate a user' })
  @ApiResponse({ status: 200, type: UserDto })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    const canManageAdmins = actor.permissions.includes(
      Permission.USERS_MANAGE_ADMINS,
    );
    return this.usersService.deactivate(
      id,
      actor.id,
      actor.role,
      canManageAdmins,
    );
  }

  @Patch(':id/role')
  @RequirePermission(Permission.ROLES_MANAGE)
  @ApiOperation({ summary: 'Change user role' })
  @ApiResponse({ status: 200, type: UserDto })
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    const canManageAdmins = actor.permissions.includes(
      Permission.USERS_MANAGE_ADMINS,
    );
    return this.usersService.changeRole(id, dto, actor.id, canManageAdmins);
  }
}

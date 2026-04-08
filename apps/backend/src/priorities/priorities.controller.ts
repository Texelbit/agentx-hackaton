import {
  Body,
  Controller,
  Delete,
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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../common/enums';
import {
  CreatePriorityDto,
  PriorityDto,
  UpdatePriorityDto,
} from './dto/priority.dto';
import { PrioritiesService } from './priorities.service';

@ApiTags('Priorities')
@ApiBearerAuth()
@Controller('priorities')
export class PrioritiesController {
  constructor(private readonly priorities: PrioritiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all priorities' })
  @ApiResponse({ status: 200, type: [PriorityDto] })
  findAll(): Promise<PriorityDto[]> {
    return this.priorities.findAll();
  }

  @Post()
  @RequirePermission(Permission.PRIORITIES_MANAGE)
  @ApiOperation({ summary: 'Create a new priority' })
  @ApiResponse({ status: 201, type: PriorityDto })
  create(@Body() dto: CreatePriorityDto): Promise<PriorityDto> {
    return this.priorities.create(dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.PRIORITIES_MANAGE)
  @ApiOperation({ summary: 'Update a priority' })
  @ApiResponse({ status: 200, type: PriorityDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriorityDto,
  ): Promise<PriorityDto> {
    return this.priorities.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.PRIORITIES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a priority' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.priorities.remove(id);
  }
}

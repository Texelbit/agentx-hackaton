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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  IncidentLinkStatus,
  Permission,
} from '../common/enums';
import {
  IncidentDto,
  UpdateIncidentDto,
  UpdateIncidentLinkDto,
} from './dto/incident.dto';
import { IncidentsService } from './incidents.service';
import { IncidentLinksService } from './services/incident-links.service';

@ApiTags('Incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly links: IncidentLinksService,
  ) {}

  @Get()
  @RequirePermission(Permission.INCIDENTS_READ_ALL)
  @ApiOperation({ summary: 'List all incidents' })
  @ApiResponse({ status: 200, type: [IncidentDto] })
  findAll(): Promise<IncidentDto[]> {
    return this.incidents.findAll();
  }

  @Get('mine')
  @RequirePermission(Permission.INCIDENTS_READ_OWN)
  @ApiOperation({ summary: 'List incidents reported by the current user' })
  @ApiResponse({ status: 200, type: [IncidentDto] })
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<IncidentDto[]> {
    return this.incidents.findMine(user.id);
  }

  @Get(':id')
  @RequirePermission(Permission.INCIDENTS_READ_OWN)
  @ApiOperation({ summary: 'Get incident detail' })
  @ApiResponse({ status: 200, type: IncidentDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    return this.incidents.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @RequirePermission(Permission.INCIDENTS_UPDATE)
  @ApiOperation({ summary: 'Update an incident (status / resolution notes)' })
  @ApiResponse({ status: 200, type: IncidentDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    return this.incidents.update(id, dto);
  }

  @Get(':id/similar')
  @RequirePermission(Permission.INCIDENTS_READ_OWN)
  @ApiOperation({ summary: 'List suggested + confirmed similar incidents' })
  listSimilar(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.listSimilar(id);
  }

  @Patch(':id/links/:linkId')
  @RequirePermission(Permission.INCIDENTS_LINK)
  @ApiOperation({ summary: 'Confirm or reject a suggested incident link' })
  async updateLink(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: UpdateIncidentLinkDto,
  ): Promise<{ ok: true }> {
    await this.links.updateStatus(
      linkId,
      dto.status as unknown as IncidentLinkStatus,
    );
    return { ok: true };
  }
}

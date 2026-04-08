import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GitHubWebhookService } from './github-webhook.service';
import { WebhookHmacGuard } from './guards/webhook-hmac.guard';
import { JiraWebhookService } from './jira-webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly githubWebhook: GitHubWebhookService,
    private readonly jiraWebhook: JiraWebhookService,
  ) {}

  @Public()
  @UseGuards(WebhookHmacGuard)
  @Post('github')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Receive GitHub webhook events' })
  async github(
    @Headers('x-github-event') eventHeader: string,
    @Body() payload: Record<string, unknown>,
  ): Promise<void> {
    await this.githubWebhook.handle(eventHeader, payload);
  }

  @Public()
  @UseGuards(WebhookHmacGuard)
  @Post('jira')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Receive Jira webhook events' })
  async jira(@Body() payload: Record<string, unknown>): Promise<void> {
    await this.jiraWebhook.handle(payload);
  }
}

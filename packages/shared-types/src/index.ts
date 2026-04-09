/**
 * Domain enums + DTO shapes shared between the backend and the two
 * frontends. Hand-mirrored from `apps/backend/src/common/enums` and the
 * Prisma schema. Keep in sync — both sides import from here so any drift is
 * a single fix.
 */

// ── Enums ──────────────────────────────────────────────────────────────
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  ENGINEER = 'ENGINEER',
  REPORTER = 'REPORTER',
}

export enum IncidentStatus {
  BACKLOG = 'BACKLOG',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  READY_TO_TEST = 'READY_TO_TEST',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum GithubEventType {
  PUSH = 'PUSH',
  PR_OPENED = 'PR_OPENED',
  PR_CLOSED = 'PR_CLOSED',
  PR_REVIEW_APPROVED = 'PR_REVIEW_APPROVED',
  PR_MERGED = 'PR_MERGED',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
}

export enum NotificationEvent {
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  STATUS_IN_PROGRESS = 'STATUS_IN_PROGRESS',
  STATUS_IN_REVIEW = 'STATUS_IN_REVIEW',
  STATUS_READY_TO_TEST = 'STATUS_READY_TO_TEST',
  STATUS_DONE = 'STATUS_DONE',
}

export enum AgentRole {
  INTAKE_AGENT = 'INTAKE_AGENT',
  TRIAGE_AGENT = 'TRIAGE_AGENT',
  EMAIL_COMPOSER = 'EMAIL_COMPOSER',
  EMBEDDINGS = 'EMBEDDINGS',
}

/**
 * Strategy class identifier — picks which LLM SDK to use at runtime.
 * NOT the same as the LlmProviderDto record (a configurable provider in DB).
 */
export enum LlmProviderKind {
  GEMINI = 'GEMINI',
  ANTHROPIC = 'ANTHROPIC',
  OPENAI = 'OPENAI',
}

export enum IncidentLinkStatus {
  SUGGESTED = 'SUGGESTED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum ChatMessageRole {
  USER = 'USER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

export enum Permission {
  INCIDENTS_CREATE = 'incidents:create',
  INCIDENTS_READ_ALL = 'incidents:read:all',
  INCIDENTS_READ_OWN = 'incidents:read:own',
  INCIDENTS_UPDATE = 'incidents:update',
  INCIDENTS_LINK = 'incidents:link',
  USERS_MANAGE = 'users:manage',
  USERS_MANAGE_ADMINS = 'users:manage:admins',
  CONFIG_MANAGE = 'config:manage',
  ROLES_MANAGE = 'roles:manage',
  LLM_MANAGE = 'llm:manage',
  PRIORITIES_MANAGE = 'priorities:manage',
  AUDIT_READ = 'audit:read',
}

// ── DTOs (mirror backend) ──────────────────────────────────────────────
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: string[];
  isActive: boolean;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriorityDto {
  id: string;
  name: string;
  description: string;
  level: number;
  color: string;
  active: boolean;
}

export interface IncidentDto {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  service: string;
  priorityName: string;
  reporterEmail: string;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  githubBranch: string | null;
  triageSummary: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IncidentLinkDto {
  id: string;
  fromId: string;
  toId: string;
  status: IncidentLinkStatus;
  similarity: number;
}

/**
 * Enriched view of an incident link returned by `GET /incidents/:id/similar`.
 * `peer*` fields are the OTHER side of the link from the requested incident's
 * perspective.
 */
export interface SimilarIncidentDto {
  linkId: string;
  status: IncidentLinkStatus;
  similarity: number;
  peerId: string;
  peerTitle: string;
  peerStatus: IncidentStatus;
  peerPriorityName: string;
  peerJiraKey: string | null;
  peerJiraUrl: string | null;
  peerCreatedAt: string;
}

export interface ChatAttachment {
  mimeType: string;
  data: string;
}

export interface ChatMessageDto {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface ChatSessionDto {
  id: string;
  userId: string;
  finalized: boolean;
  createdAt: string;
  messages?: ChatMessageDto[];
}

export interface FinalizeResponseDto {
  sessionId: string;
  incidentId: string;
}

export interface RealtimeIncidentEvent {
  id: string;
  title?: string;
  status?: IncidentStatus;
}

// ── LLM config (providers / models / assignments) ─────────────────────

export interface LlmProviderDto {
  id: string;
  name: string;
  kind: LlmProviderKind;
  active: boolean;
}

export interface CreateLlmProviderDto {
  name: string;
  kind: LlmProviderKind;
}

export interface UpdateLlmProviderDto {
  name?: string;
  kind?: LlmProviderKind;
  active?: boolean;
}

export interface LlmModelDto {
  id: string;
  providerId: string;
  name: string;
  value: string;
  active: boolean;
}

export interface CreateLlmModelDto {
  providerId: string;
  name: string;
  value: string;
}

export interface UpdateLlmModelDto {
  name?: string;
  value?: string;
  active?: boolean;
}

export interface LlmAssignmentDto {
  agentRole: AgentRole;
  modelId: string;
  modelName: string;
  modelValue: string;
  providerId: string;
  providerName: string;
  providerKind: LlmProviderKind;
}

// ── Branch state rules (GitOps) ────────────────────────────────────────

export interface BranchRuleConditionDto {
  baseBranch?: string;
  merged?: boolean;
}

export interface BranchRuleDto {
  id: string;
  eventType: GithubEventType;
  condition: BranchRuleConditionDto;
  targetStatus: IncidentStatus;
  jiraStatusId: string | null;
  priority: number;
  active: boolean;
}

export interface CreateBranchRuleDto {
  eventType: GithubEventType;
  condition?: BranchRuleConditionDto;
  targetStatus: IncidentStatus;
  priority?: number;
  active?: boolean;
}

export interface UpdateBranchRuleDto {
  eventType?: GithubEventType;
  condition?: BranchRuleConditionDto;
  targetStatus?: IncidentStatus;
  priority?: number;
  active?: boolean;
  /**
   * Manual override for the Jira status id this rule transitions to.
   * Pass an empty string to clear the link. Bypasses auto-resolution
   * from `jira_status_mappings`.
   */
  jiraStatusId?: string;
}

export interface ReorderBranchRulesDto {
  /** Ordered list of rule ids — position becomes the new priority. */
  ids: string[];
}

/**
 * One Jira status discovered from the configured project. Returned by
 * `GET /config/branch-rules/jira-statuses`. Used to populate the manual
 * "pick a Jira status" dropdown for unlinked rules.
 */
export interface JiraStatusOptionDto {
  id: string;
  name: string;
  category: string | null;
}

// ── System config (editable key/value store) ──────────────────────────

export interface SystemConfigEntryDto {
  key: string;
  value: string;
  description: string;
}

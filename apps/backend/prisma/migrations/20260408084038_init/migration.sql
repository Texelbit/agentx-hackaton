-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ENGINEER', 'REPORTER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'READY_TO_TEST', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GithubEventType" AS ENUM ('PUSH', 'PR_OPENED', 'PR_CLOSED', 'PR_REVIEW_APPROVED', 'PR_MERGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SLACK');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('INCIDENT_CREATED', 'STATUS_IN_PROGRESS', 'STATUS_IN_REVIEW', 'STATUS_READY_TO_TEST', 'STATUS_DONE');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('INTAKE_AGENT', 'TRIAGE_AGENT', 'EMAIL_COMPOSER', 'EMBEDDINGS');

-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('GEMINI', 'ANTHROPIC', 'OPENAI');

-- CreateEnum
CREATE TYPE "IncidentLinkStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'WEBHOOK_SYNC');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'JIRA_WEBHOOK', 'GITHUB_WEBHOOK');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IndexingState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "Role" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_protected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priorities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'BACKLOG',
    "priority_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reporter_email" TEXT NOT NULL,
    "jira_ticket_key" TEXT,
    "jira_ticket_url" TEXT,
    "github_branch" TEXT,
    "github_pr_url" TEXT,
    "merge_commit_sha" TEXT,
    "triage_summary" TEXT,
    "resolution_notes" TEXT,
    "embedding" vector(1536),
    "chat_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_attachments" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_links" (
    "id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "status" "IncidentLinkStatus" NOT NULL DEFAULT 'SUGGESTED',
    "similarity" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_state_rules" (
    "id" TEXT NOT NULL,
    "event_type" "GithubEventType" NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "target_status" "IncidentStatus" NOT NULL,
    "jira_status_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_state_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_status_mappings" (
    "id" TEXT NOT NULL,
    "internal_status" "IncidentStatus" NOT NULL,
    "jira_status_id" TEXT NOT NULL,
    "jira_status_name" TEXT NOT NULL,
    "jira_transition_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_status_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "llm_configs" (
    "agent_role" "AgentRole" NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("agent_role")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_documents" (
    "id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "source" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexing_status" (
    "id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "last_indexed" TIMESTAMP(3),
    "doc_count" INTEGER NOT NULL DEFAULT 0,
    "status" "IndexingState" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "indexing_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "priorities_name_key" ON "priorities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "priorities_level_key" ON "priorities"("level");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_chat_session_id_key" ON "incidents"("chat_session_id");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_reporter_id_idx" ON "incidents"("reporter_id");

-- CreateIndex
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "incident_links_from_id_to_id_key" ON "incident_links"("from_id", "to_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "jira_status_mappings_internal_status_key" ON "jira_status_mappings"("internal_status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_channel_key" ON "notification_preferences"("user_id", "event", "channel");

-- CreateIndex
CREATE INDEX "notification_logs_incident_id_event_channel_sent_at_idx" ON "notification_logs"("incident_id", "event", "channel", "sent_at");

-- CreateIndex
CREATE INDEX "rag_documents_collection_idx" ON "rag_documents"("collection");

-- CreateIndex
CREATE UNIQUE INDEX "indexing_status_collection_key" ON "indexing_status"("collection");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

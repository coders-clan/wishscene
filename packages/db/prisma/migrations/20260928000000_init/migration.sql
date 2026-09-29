-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExperienceStatus" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('scene_generation', 'upload_validation', 'export_render');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('queued', 'running', 'ready', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('candidate', 'export');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('pending', 'ready', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('approved', 'revoked');

-- CreateEnum
CREATE TYPE "ApprovalReason" AS ENUM ('user', 'superseded', 'bible_changed');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('pending', 'uploaded', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'active',
    "current_bible_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_bibles" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "parent_version" INTEGER,
    "facts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "bible_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "scene_id" UUID,
    "job_id" UUID,
    "parent_asset_id" UUID,
    "type" "AssetType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'pending',
    "object_key" TEXT,
    "content_type" TEXT,
    "bible_version" INTEGER NOT NULL,
    "provider_job_id" TEXT,
    "checks" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_events" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "experience_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "reason" "ApprovalReason" NOT NULL,
    "bible_version" INTEGER NOT NULL,
    "supersedes_id" UUID,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "experience_id" UUID,
    "scene_id" UUID,
    "upload_id" UUID,
    "kind" "JobKind" NOT NULL,
    "input_hash" TEXT NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'queued',
    "bible_version" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "provider_job_id" TEXT,
    "error_code" TEXT,
    "cost_estimate" DECIMAL(12,4),
    "cost_actual" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "max_bytes" INTEGER NOT NULL,
    "byte_size" INTEGER,
    "status" "UploadStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "bible_version" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "object_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "experiences_user_id_status_idx" ON "experiences"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "story_bibles_experience_id_version_key" ON "story_bibles"("experience_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_experience_id_ordinal_key" ON "scenes"("experience_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_id_experience_id_key" ON "scenes"("id", "experience_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_object_key_key" ON "assets"("object_key");

-- CreateIndex
CREATE INDEX "assets_experience_id_status_idx" ON "assets"("experience_id", "status");

-- CreateIndex
CREATE INDEX "assets_scene_id_idx" ON "assets"("scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_id_scene_id_key" ON "assets"("id", "scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_events_seq_key" ON "approval_events"("seq");

-- CreateIndex
CREATE INDEX "approval_events_scene_id_seq_idx" ON "approval_events"("scene_id", "seq");

-- CreateIndex
CREATE INDEX "approval_events_experience_id_idx" ON "approval_events"("experience_id");

-- CreateIndex
CREATE INDEX "jobs_user_id_state_idx" ON "jobs"("user_id", "state");

-- CreateIndex
CREATE INDEX "jobs_experience_id_state_idx" ON "jobs"("experience_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_user_id_input_hash_key" ON "jobs"("user_id", "input_hash");

-- CreateIndex
CREATE INDEX "outbox_events_dispatched_at_id_idx" ON "outbox_events"("dispatched_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_object_key_key" ON "uploads"("object_key");

-- CreateIndex
CREATE INDEX "uploads_user_id_status_idx" ON "uploads"("user_id", "status");

-- CreateIndex
CREATE INDEX "uploads_user_id_created_at_idx" ON "uploads"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exports_object_key_key" ON "exports"("object_key");

-- CreateIndex
CREATE INDEX "exports_experience_id_idx" ON "exports"("experience_id");

-- CreateIndex
CREATE INDEX "audit_events_user_id_created_at_idx" ON "audit_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_bibles" ADD CONSTRAINT "story_bibles_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_scene_id_experience_id_fkey" FOREIGN KEY ("scene_id", "experience_id") REFERENCES "scenes"("id", "experience_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_asset_id_scene_id_fkey" FOREIGN KEY ("asset_id", "scene_id") REFERENCES "assets"("id", "scene_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "approval_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written (ADR 0002). Prisma diffs ignore functions and triggers.
-- ---------------------------------------------------------------------------

-- Story Bible, approval and audit history are append-only. Hard deletion (account
-- deletion under retention policy) runs in a transaction with:
--   SET LOCAL wishscene.purge = 'on';
CREATE FUNCTION wishscene_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('wishscene.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;

CREATE TRIGGER story_bibles_append_only BEFORE UPDATE OR DELETE ON "story_bibles"
  FOR EACH ROW EXECUTE FUNCTION wishscene_append_only();
CREATE TRIGGER story_bibles_no_truncate BEFORE TRUNCATE ON "story_bibles"
  FOR EACH STATEMENT EXECUTE FUNCTION wishscene_append_only();
CREATE TRIGGER approval_events_append_only BEFORE UPDATE OR DELETE ON "approval_events"
  FOR EACH ROW EXECUTE FUNCTION wishscene_append_only();
CREATE TRIGGER approval_events_no_truncate BEFORE TRUNCATE ON "approval_events"
  FOR EACH STATEMENT EXECUTE FUNCTION wishscene_append_only();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION wishscene_append_only();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION wishscene_append_only();

-- Ownership never moves between accounts.
CREATE FUNCTION wishscene_owner_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION '%.user_id is immutable', TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER experiences_owner_immutable BEFORE UPDATE OF "user_id" ON "experiences"
  FOR EACH ROW EXECUTE FUNCTION wishscene_owner_immutable();
CREATE TRIGGER jobs_owner_immutable BEFORE UPDATE OF "user_id" ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION wishscene_owner_immutable();
CREATE TRIGGER uploads_owner_immutable BEFORE UPDATE OF "user_id" ON "uploads"
  FOR EACH ROW EXECUTE FUNCTION wishscene_owner_immutable();

-- A job can only reference an experience, scene and upload owned by the job's user.
CREATE FUNCTION wishscene_jobs_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.experience_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "experiences" e WHERE e.id = NEW.experience_id AND e.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'job experience is not owned by the job user' USING ERRCODE = '23503';
  END IF;
  IF NEW.scene_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "scenes" s WHERE s.id = NEW.scene_id AND s.experience_id = NEW.experience_id
  ) THEN
    RAISE EXCEPTION 'job scene is not part of the job experience' USING ERRCODE = '23503';
  END IF;
  IF NEW.upload_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "uploads" u WHERE u.id = NEW.upload_id AND u.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'job upload is not owned by the job user' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER jobs_owner_guard
  BEFORE INSERT OR UPDATE OF "user_id", "experience_id", "scene_id", "upload_id" ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION wishscene_jobs_owner_guard();

-- An asset's scene belongs to the asset's experience.
CREATE FUNCTION wishscene_assets_scene_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scene_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "scenes" s WHERE s.id = NEW.scene_id AND s.experience_id = NEW.experience_id
  ) THEN
    RAISE EXCEPTION 'asset scene is not part of the asset experience' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER assets_scene_guard
  BEFORE INSERT OR UPDATE OF "experience_id", "scene_id" ON "assets"
  FOR EACH ROW EXECUTE FUNCTION wishscene_assets_scene_guard();

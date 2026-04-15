-- Migration: sync_full_schema
-- Bridges the old initial migration schema to the current schema.prisma state.
-- Safe to run on a server that has only the first migration applied.

-- ─── Step 1: Drop FKs that reference columns we're about to change ────────────

ALTER TABLE "stream_sessions" DROP CONSTRAINT IF EXISTS "stream_sessions_viewerId_fkey";
ALTER TABLE "ad_breaks"       DROP CONSTRAINT IF EXISTS "ad_breaks_contentId_fkey";

-- ─── Step 2: Drop tables no longer in schema ──────────────────────────────────

DROP TABLE IF EXISTS "ad_breaks";

-- ─── Step 3: Drop unique index that includes columns being removed ────────────

DROP INDEX IF EXISTS "contents_channelId_slug_key";

-- ─── Step 4: Drop columns using old enums so we can replace them ──────────────

ALTER TABLE "contents" DROP COLUMN IF EXISTS "type";
ALTER TABLE "contents" DROP COLUMN IF EXISTS "status";

-- ─── Step 5: Drop old enums and create new ones ───────────────────────────────

DROP TYPE IF EXISTS "ContentType";
DROP TYPE IF EXISTS "ContentStatus";
DROP TYPE IF EXISTS "AdBreakPosition";

CREATE TYPE "ContentType"   AS ENUM ('LIVE', 'VOD');
CREATE TYPE "ContentStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PROCESSING', 'ERROR', 'VOD2LIVE');

-- ─── Step 6: Reshape contents table ──────────────────────────────────────────

-- Remove old columns
ALTER TABLE "contents" DROP COLUMN IF EXISTS "slug";
ALTER TABLE "contents" DROP COLUMN IF EXISTS "thumbnailUrl";
ALTER TABLE "contents" DROP COLUMN IF EXISTS "duration";
ALTER TABLE "contents" DROP COLUMN IF EXISTS "publishedAt";

-- Add new enum columns
ALTER TABLE "contents" ADD COLUMN "type"   "ContentType"   NOT NULL DEFAULT 'LIVE';
ALTER TABLE "contents" ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'INACTIVE';

-- Add streamKey (nullable first, fill existing rows, then constrain)
ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "streamKey"   TEXT;
ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "hlsUrl"      TEXT;
ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "localPath"   TEXT;
ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER;

UPDATE "contents" SET "streamKey" = gen_random_uuid()::TEXT WHERE "streamKey" IS NULL;
ALTER TABLE "contents" ALTER COLUMN "streamKey" SET NOT NULL;
ALTER TABLE "contents" ALTER COLUMN "streamKey" SET DEFAULT gen_random_uuid()::TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "contents_streamKey_key" ON "contents"("streamKey");

-- ─── Step 7: Reshape stream_sessions table ────────────────────────────────────

ALTER TABLE "stream_sessions" DROP COLUMN IF EXISTS "viewerId";
ALTER TABLE "stream_sessions" ADD COLUMN IF NOT EXISTS "avgLatencyMs"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stream_sessions" ADD COLUMN IF NOT EXISTS "peersConnected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stream_sessions" ADD COLUMN IF NOT EXISTS "qualityChanges" INTEGER NOT NULL DEFAULT 0;

-- ─── Step 8: Create new tables ────────────────────────────────────────────────

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"        TEXT        NOT NULL,
    "token"     TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "userId"    TEXT        NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used"      BOOLEAN     NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_key" ON "password_reset_tokens"("token");
CREATE INDEX        IF NOT EXISTS "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- clips
CREATE TABLE IF NOT EXISTS "clips" (
    "id"          TEXT             NOT NULL,
    "channelId"   TEXT             NOT NULL,
    "contentId"   TEXT             NOT NULL,
    "title"       TEXT             NOT NULL,
    "startSec"    DOUBLE PRECISION NOT NULL,
    "endSec"      DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "hlsUrl"      TEXT,
    "thumbnailUrl" TEXT,
    "outputPath"  TEXT,
    "status"      TEXT             NOT NULL DEFAULT 'processing',
    "platforms"   JSONB,
    "views"       INTEGER          NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "clips_channelId_idx" ON "clips"("channelId");
CREATE INDEX IF NOT EXISTS "clips_contentId_idx" ON "clips"("contentId");

-- private_sessions
CREATE TABLE IF NOT EXISTS "private_sessions" (
    "id"                 TEXT         NOT NULL,
    "channelId"          TEXT         NOT NULL,
    "title"              TEXT         NOT NULL,
    "description"        TEXT,
    "streamKey"          TEXT         NOT NULL,
    "password"           TEXT         NOT NULL,
    "scheduledAt"        TIMESTAMP(3),
    "startedAt"          TIMESTAMP(3),
    "endedAt"            TIMESTAMP(3),
    "duration"           INTEGER      NOT NULL,
    "maxIdleTime"        INTEGER      NOT NULL DEFAULT 10,
    "status"             TEXT         NOT NULL DEFAULT 'scheduled',
    "metadata"           JSONB        NOT NULL DEFAULT '{}',
    "viewerCount"        INTEGER      NOT NULL DEFAULT 0,
    "peakViewers"        INTEGER      NOT NULL DEFAULT 0,
    "totalMinutesViewed" INTEGER      NOT NULL DEFAULT 0,
    "webhookUrl"         TEXT,
    "webhookSecret"      TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "private_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "private_sessions_streamKey_key" ON "private_sessions"("streamKey");
CREATE INDEX        IF NOT EXISTS "private_sessions_channelId_idx" ON "private_sessions"("channelId");
CREATE INDEX        IF NOT EXISTS "private_sessions_status_idx"    ON "private_sessions"("status");

-- session_events
CREATE TABLE IF NOT EXISTS "session_events" (
    "id"        TEXT         NOT NULL,
    "sessionId" TEXT         NOT NULL,
    "type"      TEXT         NOT NULL,
    "userId"    TEXT,
    "userEmail" TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "session_events_sessionId_idx" ON "session_events"("sessionId");
CREATE INDEX IF NOT EXISTS "session_events_type_idx"      ON "session_events"("type");

-- epg_entries
CREATE TABLE IF NOT EXISTS "epg_entries" (
    "id"          TEXT         NOT NULL,
    "channelId"   TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "description" TEXT,
    "contentId"   TEXT,
    "startTime"   TIMESTAMP(3) NOT NULL,
    "endTime"     TIMESTAMP(3) NOT NULL,
    "duration"    INTEGER      NOT NULL,
    "metadata"    JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "epg_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "epg_entries_channelId_idx"  ON "epg_entries"("channelId");
CREATE INDEX IF NOT EXISTS "epg_entries_startTime_idx"  ON "epg_entries"("startTime");

-- castify_video_billing (must exist before castify_video_sessions due to FK)
CREATE TABLE IF NOT EXISTS "castify_video_billing" (
    "id"           TEXT             NOT NULL,
    "channelId"    TEXT             NOT NULL,
    "month"        INTEGER          NOT NULL,
    "year"         INTEGER          NOT NULL,
    "cdn1to1Cost"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hybridCost"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseFee"      DOUBLE PRECISION NOT NULL DEFAULT 50,
    "totalCost"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cdn1to1Gb"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hybridGb"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessionCount" INTEGER          NOT NULL DEFAULT 0,
    "paid"         BOOLEAN          NOT NULL DEFAULT false,
    "paidAt"       TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "castify_video_billing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "castify_video_billing_channelId_month_year_key"
    ON "castify_video_billing"("channelId", "month", "year");

-- castify_video_sessions
CREATE TABLE IF NOT EXISTS "castify_video_sessions" (
    "id"           TEXT             NOT NULL,
    "channelId"    TEXT             NOT NULL,
    "title"        TEXT             NOT NULL,
    "mode"         TEXT             NOT NULL DEFAULT '1to1',
    "deliveryMode" TEXT             NOT NULL DEFAULT 'cdn',
    "streamKey"    TEXT             NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "password"     TEXT,
    "bandwidthGb"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratePerGb"    DOUBLE PRECISION NOT NULL DEFAULT 0.04635,
    "baseFee"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt"    TIMESTAMP(3),
    "endedAt"      TIMESTAMP(3),
    "status"       TEXT             NOT NULL DEFAULT 'created',
    "webhookUrl"   TEXT,
    "webhookSecret" TEXT,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingId"    TEXT,
    CONSTRAINT "castify_video_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "castify_video_sessions_streamKey_key"
    ON "castify_video_sessions"("streamKey");
CREATE INDEX IF NOT EXISTS "castify_video_sessions_channelId_idx" ON "castify_video_sessions"("channelId");
CREATE INDEX IF NOT EXISTS "castify_video_sessions_status_idx"    ON "castify_video_sessions"("status");

-- ─── Step 9: Add foreign keys for new tables ──────────────────────────────────

ALTER TABLE "clips"
    ADD CONSTRAINT "clips_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "clips_contentId_fkey"
        FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "private_sessions"
    ADD CONSTRAINT "private_sessions_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_events"
    ADD CONSTRAINT "session_events_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "private_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "epg_entries"
    ADD CONSTRAINT "epg_entries_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "epg_entries_contentId_fkey"
        FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "castify_video_billing"
    ADD CONSTRAINT "castify_video_billing_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "castify_video_sessions"
    ADD CONSTRAINT "castify_video_sessions_channelId_fkey"
        FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "castify_video_sessions_billingId_fkey"
        FOREIGN KEY ("billingId") REFERENCES "castify_video_billing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

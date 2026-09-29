-- Review fixes for issue #2 (ADR 0002): uploads.etag pins the object that completion
-- checked; throttles backs per-address magic-link limits; experiences.status was unused
-- (deleted_at is the soft-delete marker), so its enum and index go.

-- DropIndex
DROP INDEX "experiences_user_id_status_idx";

-- AlterTable
ALTER TABLE "experiences" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "uploads" ADD COLUMN     "etag" TEXT;

-- DropEnum
DROP TYPE "ExperienceStatus";

-- CreateTable
CREATE TABLE "throttles" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "throttles_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "experiences_user_id_created_at_idx" ON "experiences"("user_id", "created_at");


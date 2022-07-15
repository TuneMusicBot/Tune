/*
  Warnings:

  - You are about to drop the column `idleSince` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `mutedSince` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `pausedSince` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `queueRepeat` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `trackRepeat` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "idleSince",
DROP COLUMN "mutedSince",
DROP COLUMN "pausedSince",
DROP COLUMN "queueRepeat",
DROP COLUMN "trackRepeat",
ADD COLUMN     "display_artwork" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idle_since" TIMESTAMP(3),
ADD COLUMN     "muted_since" TIMESTAMP(3),
ADD COLUMN     "paused_since" TIMESTAMP(3),
ADD COLUMN     "queue_repeat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "track_repeat" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlayerTrack" ALTER COLUMN "added_at" SET DEFAULT CURRENT_TIMESTAMP;

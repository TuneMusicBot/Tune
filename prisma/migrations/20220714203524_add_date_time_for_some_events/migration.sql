/*
  Warnings:

  - A unique constraint covering the columns `[id]` on the table `PlayerTrack` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "idleSince" TIMESTAMP(3),
ADD COLUMN     "mutedSince" TIMESTAMP(3),
ADD COLUMN     "pausedSince" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTrack_id_key" ON "PlayerTrack"("id");

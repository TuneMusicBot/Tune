-- CreateEnum
CREATE TYPE "VotePlatforms" AS ENUM ('TOPGG', 'VCODES', 'VOIDBOTS', 'BESTLIST', 'DSME', 'BLUEPHOENIX', 'BOTLIST');

-- CreateTable
CREATE TABLE "Vote" (
    "id" SERIAL NOT NULL,
    "user" TEXT NOT NULL,
    "is_weekend" BOOLEAN,
    "platform" "VotePlatforms" NOT NULL,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vote_id_key" ON "Vote"("id");

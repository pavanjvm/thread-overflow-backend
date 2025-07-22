/*
  Warnings:

  - Added the required column `status` to the `Idea` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "status" "IdeaStatus" NOT NULL;

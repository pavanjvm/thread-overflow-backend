/*
  Warnings:

  - You are about to drop the column `potentialDollarValue` on the `Idea` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Idea" DROP COLUMN "potentialDollarValue",
ADD COLUMN     "potentialBenefits" TEXT[];

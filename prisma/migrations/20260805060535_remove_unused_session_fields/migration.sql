/*
  Warnings:

  - You are about to drop the column `accountOwner` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `collaborator` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `locale` on the `session` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "session" DROP COLUMN "accountOwner",
DROP COLUMN "collaborator",
DROP COLUMN "email",
DROP COLUMN "emailVerified",
DROP COLUMN "firstName",
DROP COLUMN "lastName",
DROP COLUMN "locale",
DROP COLUMN "userId";

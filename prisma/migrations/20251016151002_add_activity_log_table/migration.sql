/*
  Warnings:

  - The primary key for the `DataHeader` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `data` on the `DataHeader` table. All the data in the column will be lost.
  - The `id` column on the `DataHeader` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `datasets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `authTag` to the `DataHeader` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedData` to the `DataHeader` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedDataKey` to the `DataHeader` table without a default value. This is not possible if the table is not empty.
  - Added the required column `iv` to the `DataHeader` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `datasetId` on the `DataHeader` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."DataHeader" DROP CONSTRAINT "DataHeader_datasetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."datasets" DROP CONSTRAINT "datasets_userId_fkey";

-- AlterTable
ALTER TABLE "public"."DataHeader" DROP CONSTRAINT "DataHeader_pkey",
DROP COLUMN "data",
ADD COLUMN     "authTag" TEXT NOT NULL,
ADD COLUMN     "encryptedData" TEXT NOT NULL,
ADD COLUMN     "encryptedDataKey" TEXT NOT NULL,
ADD COLUMN     "iv" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "datasetId",
ADD COLUMN     "datasetId" UUID NOT NULL,
ADD CONSTRAINT "DataHeader_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "public"."datasets";

-- DropTable
DROP TABLE "public"."users";

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentHashedRefreshToken" TEXT,
    "currentVerifyToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Dataset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "thousandsSeparator" TEXT DEFAULT ',',
    "decimalSeparator" TEXT DEFAULT '.',
    "dateFormat" TEXT DEFAULT 'YYYY-MM-DD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Chart" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "datasetId" UUID,
    "userId" UUID NOT NULL,

    CONSTRAINT "Chart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorId" UUID,
    "actorType" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_name_key" ON "public"."Dataset"("name");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");

-- AddForeignKey
ALTER TABLE "public"."Dataset" ADD CONSTRAINT "Dataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataHeader" ADD CONSTRAINT "DataHeader_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chart" ADD CONSTRAINT "Chart_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chart" ADD CONSTRAINT "Chart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

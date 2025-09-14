-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataHeader" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "DataHeader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasets_name_key" ON "public"."datasets"("name");

-- AddForeignKey
ALTER TABLE "public"."datasets" ADD CONSTRAINT "datasets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataHeader" ADD CONSTRAINT "DataHeader_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

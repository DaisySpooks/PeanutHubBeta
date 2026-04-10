-- AlterTable
ALTER TABLE "User"
ADD COLUMN "hasRequiredCollectionAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiredCollectionCheckedAt" TIMESTAMP(3),
ADD COLUMN "requiredCollectionMint" TEXT;

-- CreateIndex
CREATE INDEX "User_hasRequiredCollectionAccess_idx" ON "User"("hasRequiredCollectionAccess");

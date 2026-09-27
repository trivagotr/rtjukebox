-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "file_hash" CHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "idx_songs_file_hash_unique" ON "songs"("file_hash");

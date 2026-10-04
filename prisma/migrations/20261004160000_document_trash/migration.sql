ALTER TABLE "document"
  ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "purge_after" TIMESTAMP(3),
  ADD COLUMN "purge_started_at" TIMESTAMP(3),
  ADD COLUMN "purged_at" TIMESTAMP(3),
  ADD CONSTRAINT "document_trash_state_check" CHECK (
    (NOT is_deleted AND deleted_at IS NULL AND purge_after IS NULL AND purge_started_at IS NULL AND purged_at IS NULL)
    OR (is_deleted AND deleted_at IS NOT NULL AND purge_after IS NOT NULL
      AND (purged_at IS NULL OR purge_started_at IS NOT NULL))
  );
CREATE INDEX "document_is_deleted_purged_at_purge_after_idx" ON "document"("is_deleted", "purged_at", "purge_after");
ALTER TABLE "answer_source" DROP CONSTRAINT "answer_source_chunk_id_fkey";
ALTER TABLE "answer_source" ALTER COLUMN "chunk_id" DROP NOT NULL;
ALTER TABLE "answer_source" ADD CONSTRAINT "answer_source_chunk_id_fkey"
  FOREIGN KEY ("chunk_id") REFERENCES "document_chunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "document_storage_key" (
  "key" TEXT PRIMARY KEY,
  "document_id" INTEGER NOT NULL REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "document_storage_key_document_id_idx" ON "document_storage_key"("document_id");
INSERT INTO "document_storage_key" ("key", "document_id")
  SELECT storage_path, min(id) FROM document GROUP BY storage_path;

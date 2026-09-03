-- AlterTable
ALTER TABLE "knowledge_space" ADD COLUMN     "faq_document_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_space_faq_document_id_key" ON "knowledge_space"("faq_document_id");

-- AddForeignKey
ALTER TABLE "knowledge_space" ADD CONSTRAINT "knowledge_space_faq_document_id_fkey" FOREIGN KEY ("faq_document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;


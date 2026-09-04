-- Speeds up cosine-distance similarity search (dc.embedding <=> query) in document-chunk.repo.ts.
-- Prisma's schema DSL has no native HNSW support for pgvector, so this index lives only here.
CREATE INDEX IF NOT EXISTS "document_chunk_embedding_hnsw_idx"
  ON "document_chunk" USING hnsw (embedding vector_cosine_ops);

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Employee', 'Admin');

-- CreateEnum
CREATE TYPE "WorkSpaceRole" AS ENUM ('Owner', 'Editor', 'Viewer');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('Processing', 'Ready', 'Failed');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PDF', 'MD', 'TXT', 'DOCX');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('Public', 'Restricted');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('Read', 'Edit', 'Manage');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('User', 'Assistant');

-- CreateEnum
CREATE TYPE "Rating" AS ENUM ('Helpful', 'NotHelpful');

-- CreateTable
CREATE TABLE "category" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "chat_session_id" INTEGER NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_source" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "chunk_id" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unanswered_questions" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "description" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'Processing',
    "storage_path" TEXT NOT NULL,
    "file_type" "FileType" NOT NULL,
    "file_size" BIGINT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'Public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_permission" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permission" "PermissionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunk" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content_chunk" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message_id" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "rating" "Rating" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_space" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_space_type" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_space_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Employee',
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_workspace" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "role" "WorkSpaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_public_id_key" ON "category"("public_id");

-- CreateIndex
CREATE INDEX "category_knowledge_space_id_idx" ON "category"("knowledge_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_name_knowledge_space_id_key" ON "category"("name", "knowledge_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_public_id_key" ON "chat_sessions"("public_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_knowledge_space_id_idx" ON "chat_sessions"("knowledge_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_public_id_key" ON "chat_messages"("public_id");

-- CreateIndex
CREATE INDEX "chat_messages_chat_session_id_idx" ON "chat_messages"("chat_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "unanswered_questions_public_id_key" ON "unanswered_questions"("public_id");

-- CreateIndex
CREATE INDEX "unanswered_questions_knowledge_space_id_idx" ON "unanswered_questions"("knowledge_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_public_id_key" ON "document"("public_id");

-- CreateIndex
CREATE INDEX "document_knowledge_space_id_idx" ON "document"("knowledge_space_id");

-- CreateIndex
CREATE INDEX "document_author_id_idx" ON "document"("author_id");

-- CreateIndex
CREATE INDEX "document_category_id_idx" ON "document"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_id_storage_path_key" ON "document"("id", "storage_path");

-- CreateIndex
CREATE INDEX "document_permission_document_id_idx" ON "document_permission"("document_id");

-- CreateIndex
CREATE INDEX "document_permission_user_id_idx" ON "document_permission"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_permission_document_id_user_id_key" ON "document_permission"("document_id", "user_id");

-- CreateIndex
CREATE INDEX "document_chunk_document_id_idx" ON "document_chunk"("document_id");

-- CreateIndex
CREATE INDEX "document_chunk_knowledge_space_id_idx" ON "document_chunk"("knowledge_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunk_document_id_chunk_index_key" ON "document_chunk"("document_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_public_id_key" ON "feedback"("public_id");

-- CreateIndex
CREATE INDEX "feedback_user_id_idx" ON "feedback"("user_id");

-- CreateIndex
CREATE INDEX "feedback_message_id_idx" ON "feedback"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_user_id_message_id_key" ON "feedback"("user_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_space_public_id_key" ON "knowledge_space"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_space_type_public_id_key" ON "knowledge_space_type"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_space_type_name_key" ON "knowledge_space_type"("name");

-- CreateIndex
CREATE INDEX "knowledge_space_type_name_idx" ON "knowledge_space_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_public_id_key" ON "user"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_workspace_public_id_key" ON "user_workspace"("public_id");

-- CreateIndex
CREATE INDEX "user_workspace_user_id_idx" ON "user_workspace"("user_id");

-- CreateIndex
CREATE INDEX "user_workspace_knowledge_space_id_idx" ON "user_workspace"("knowledge_space_id");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_source" ADD CONSTRAINT "answer_source_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_source" ADD CONSTRAINT "answer_source_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_source" ADD CONSTRAINT "answer_source_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_source" ADD CONSTRAINT "answer_source_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permission" ADD CONSTRAINT "document_permission_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_permission" ADD CONSTRAINT "document_permission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_space" ADD CONSTRAINT "knowledge_space_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "knowledge_space_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspace" ADD CONSTRAINT "user_workspace_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspace" ADD CONSTRAINT "user_workspace_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "user_workspace_user_id_knowledge_space_id_key" ON "user_workspace"("user_id", "knowledge_space_id");

-- CreateTable
CREATE TABLE "demo_sessions" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "knowledge_space_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_daily_usage" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_public_id_key" ON "demo_sessions"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_user_id_key" ON "demo_sessions"("user_id");

-- CreateIndex
CREATE INDEX "demo_sessions_ip_hash_created_at_idx" ON "demo_sessions"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "demo_sessions_expires_at_idx" ON "demo_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "demo_daily_usage_public_id_key" ON "demo_daily_usage"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_daily_usage_day_key" ON "demo_daily_usage"("day");

-- AddForeignKey
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_knowledge_space_id_fkey" FOREIGN KEY ("knowledge_space_id") REFERENCES "knowledge_space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


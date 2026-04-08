/*
  Warnings:

  - You are about to drop the column `model` on the `llm_configs` table. All the data in the column will be lost.
  - You are about to drop the column `provider` on the `llm_configs` table. All the data in the column will be lost.
  - Added the required column `model_id` to the `llm_configs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LlmProviderKind" AS ENUM ('GEMINI', 'ANTHROPIC', 'OPENAI');

-- AlterTable
ALTER TABLE "llm_configs" DROP COLUMN "model",
DROP COLUMN "provider",
ADD COLUMN     "model_id" TEXT NOT NULL;

-- DropEnum
DROP TYPE "LlmProvider";

-- CreateTable
CREATE TABLE "llm_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LlmProviderKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_providers_name_key" ON "llm_providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "llm_models_provider_id_value_key" ON "llm_models"("provider_id", "value");

-- AddForeignKey
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "llm_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

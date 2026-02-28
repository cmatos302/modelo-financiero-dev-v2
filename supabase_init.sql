-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin_gerente', 'operador', 'consulta');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Planilla" (
    "id" TEXT NOT NULL,
    "correlativo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cliente" TEXT NOT NULL,
    "proyecto" TEXT NOT NULL,
    "montoBrutoUsd" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanillaItem" (
    "id" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "especialidad" TEXT,
    "tarifaUsd" DECIMAL(14,2),
    "horas" DECIMAL(10,2),
    "costoUsd" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanillaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tasa" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bcv" DECIMAL(12,4) NOT NULL,
    "paralela" DECIMAL(12,4) NOT NULL,
    "fuente" TEXT NOT NULL,

    CONSTRAINT "Tasa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recursoId" TEXT,
    "accion" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planillaId" TEXT,
    "tasaId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Planilla_correlativo_key" ON "public"."Planilla"("correlativo");

-- CreateIndex
CREATE INDEX "Planilla_fecha_idx" ON "public"."Planilla"("fecha");

-- CreateIndex
CREATE INDEX "Planilla_cliente_idx" ON "public"."Planilla"("cliente");

-- CreateIndex
CREATE INDEX "Planilla_proyecto_idx" ON "public"."Planilla"("proyecto");

-- CreateIndex
CREATE INDEX "PlanillaItem_planillaId_idx" ON "public"."PlanillaItem"("planillaId");

-- CreateIndex
CREATE INDEX "Tasa_fecha_idx" ON "public"."Tasa"("fecha");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_recurso_idx" ON "public"."AuditLog"("recurso");

-- CreateIndex
CREATE INDEX "AuditLog_accion_idx" ON "public"."AuditLog"("accion");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."PlanillaItem" ADD CONSTRAINT "PlanillaItem_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "public"."Planilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "public"."Planilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_tasaId_fkey" FOREIGN KEY ("tasaId") REFERENCES "public"."Tasa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed users (demo)
INSERT INTO "public"."User" ("id","email","passwordHash","name","role","createdAt","updatedAt") VALUES
('u1','admin@hardsoft.local','$2b$10$desy6CJjQTjZR/nXE2I3kObbaYsVSZR0wGeg3SPZFffmpch0S7wyC','Admin Demo','admin_gerente',NOW(),NOW()),
('u2','operador@hardsoft.local','$2b$10$fjOHtEuPlwLPbcSEe4brI.ZlqqZykjsX8Zze6SW3VAA0IzUJTSNrW','Operador Demo','operador',NOW(),NOW()),
('u3','consulta@hardsoft.local','$2b$10$FW3QBC9O3ybKiSv7BoMuZ.TnuygiW0tw9IPd8Bpskvz1nWahq7dDG','Consulta Demo','consulta',NOW(),NOW())
ON CONFLICT ("email") DO UPDATE SET
"passwordHash" = EXCLUDED."passwordHash",
"name" = EXCLUDED."name",
"role" = EXCLUDED."role",
"updatedAt" = NOW();

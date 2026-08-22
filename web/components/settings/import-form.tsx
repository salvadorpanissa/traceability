"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { toast } from "@/components/ui/toast";
import { ColumnMapper } from "@/components/activities/column-mapper";
import type { ColumnMapping } from "@/lib/activities/column-mapping";
import {
  ANIMAL_IMPORT_MEANINGS,
  applyImportColumnMapping,
  detectImportMapping,
  type MappedImportRow,
} from "@/lib/activities/bulk-import-mapping";
import {
  parseImportFileAction,
  previewImportAction,
  importChunkAction,
  type ImportChunkActionResult,
  type ImportPreviewRow,
} from "@/app/(protected)/settings/import/actions";

const CHUNK_SIZE = 200;

type Phase =
  | { step: "upload" }
  | { step: "map"; headers: string[]; rows: string[][] }
  | { step: "previewing" }
  | { step: "preview"; mappedRows: MappedImportRow[]; preview: ImportPreviewRow[] }
  | { step: "importing"; total: number; processed: number }
  | { step: "done"; createdCount: number; updatedCount: number; errors: ImportChunkActionResult["errors"] }
  | {
      step: "error";
      message: string;
      createdCount: number;
      updatedCount: number;
      errors: ImportChunkActionResult["errors"];
      processed: number;
      total: number;
    };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error";
}

// Splits mappedRows into rows whose (non-empty) tag is unique across the
// WHOLE file, and rows whose tag is duplicated somewhere else in the file.
// Duplicate-tag rows never reach the server: chunking happens after this
// split, so a tag repeated across what would otherwise be two different
// 200-row chunks is still caught as a file-level duplicate instead of the
// second chunk's row misleadingly reporting "ya existe en el sistema".
function partitionDuplicateTags(mappedRows: MappedImportRow[]): {
  uniqueRows: MappedImportRow[];
  duplicateRows: MappedImportRow[];
} {
  const tagCounts = new Map<string, number>();
  for (const row of mappedRows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const uniqueRows: MappedImportRow[] = [];
  const duplicateRows: MappedImportRow[] = [];
  for (const row of mappedRows) {
    if (row.tag && (tagCounts.get(row.tag) ?? 0) > 1) {
      duplicateRows.push(row);
    } else {
      uniqueRows.push(row);
    }
  }
  return { uniqueRows, duplicateRows };
}

function ImportSummary({
  createdCount,
  updatedCount,
  errors,
}: {
  createdCount: number;
  updatedCount: number;
  errors: ImportChunkActionResult["errors"];
}) {
  return (
    <>
      <p className="text-sm font-medium">
        {createdCount} filas creadas, {updatedCount} filas editadas
      </p>
      {errors.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Caravana</th>
              <th className="text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error, index) => (
              <tr key={`${error.tag}-${index}`}>
                <td>{error.tag}</td>
                <td>{error.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function ImportForm() {
  const [phase, setPhase] = useState<Phase>({ step: "upload" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const { headers, rows } = await parseImportFileAction(formData);
      setPhase({ step: "map", headers, rows });
    } catch (error) {
      setPhase({
        step: "error",
        message: errorMessage(error),
        createdCount: 0,
        updatedCount: 0,
        errors: [],
        processed: 0,
        total: 0,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleMappingSubmit(mapping: ColumnMapping[]) {
    if (phase.step !== "map") return;
    const mappedRows: MappedImportRow[] = applyImportColumnMapping(phase.headers, phase.rows, mapping);
    const { uniqueRows, duplicateRows } = partitionDuplicateTags(mappedRows);
    const duplicatePreview: ImportPreviewRow[] = duplicateRows.map((row) => ({
      tag: row.tag,
      action: "error",
      reason: "Caravana duplicada en el archivo",
    }));

    setPhase({ step: "previewing" });
    const preview = await previewImportAction(uniqueRows);
    setPhase({ step: "preview", mappedRows, preview: [...duplicatePreview, ...preview] });
  }

  async function handleConfirmImport() {
    if (phase.step !== "preview") return;
    const { uniqueRows, duplicateRows } = partitionDuplicateTags(phase.mappedRows);
    const duplicateTagErrors: ImportChunkActionResult["errors"] = duplicateRows.map((row) => ({
      tag: row.tag,
      reason: "Caravana duplicada en el archivo",
    }));
    const chunks = chunk(uniqueRows, CHUNK_SIZE);

    setPhase({ step: "importing", total: uniqueRows.length, processed: 0 });

    let createdCount = 0;
    let updatedCount = 0;
    const errors: ImportChunkActionResult["errors"] = [...duplicateTagErrors];
    let processed = 0;

    try {
      for (const rowsChunk of chunks) {
        const result = await importChunkAction(rowsChunk);
        createdCount += result.createdCount;
        updatedCount += result.updatedCount;
        errors.push(...result.errors);
        processed += rowsChunk.length;
        setPhase({ step: "importing", total: uniqueRows.length, processed });
      }
    } catch (error) {
      toast({ type: "error", title: errorMessage(error) });
      setPhase({
        step: "error",
        message: errorMessage(error),
        createdCount,
        updatedCount,
        errors,
        processed,
        total: uniqueRows.length,
      });
      return;
    }

    toast({ type: "success", title: `${createdCount} filas creadas, ${updatedCount} filas editadas.` });
    setPhase({ step: "done", createdCount, updatedCount, errors });
  }

  if (phase.step === "upload") {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor="import-file" className="text-sm font-medium">
          Archivo
        </label>
        <FileInput id="import-file" aria-label="Archivo" accept=".xlsx" file={file} onChange={setFile} />
        <Button type="button" disabled={!file || uploading} onClick={handleUpload}>
          Subir
        </Button>
      </div>
    );
  }

  if (phase.step === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">{phase.message}</p>
        <ImportSummary createdCount={phase.createdCount} updatedCount={phase.updatedCount} errors={phase.errors} />
        <Button type="button" onClick={() => setPhase({ step: "upload" })}>
          Volver a empezar
        </Button>
      </div>
    );
  }

  if (phase.step === "map") {
    return (
      <ColumnMapper
        headers={phase.headers}
        availableMeanings={ANIMAL_IMPORT_MEANINGS}
        initialMapping={detectImportMapping(phase.headers)}
        onSubmit={handleMappingSubmit}
      />
    );
  }

  if (phase.step === "previewing") {
    return <p className="text-sm">Analizando archivo…</p>;
  }

  if (phase.step === "preview") {
    const toCreate = phase.preview.filter((r) => r.action === "crear").length;
    const toUpdate = phase.preview.filter((r) => r.action === "editar").length;
    const previewErrors = phase.preview.filter((r): r is Extract<ImportPreviewRow, { action: "error" }> => r.action === "error");

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          Se crearán {toCreate} animales, se editarán {toUpdate} animales existentes
          {previewErrors.length > 0 && `, ${previewErrors.length} filas con error`}.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Caravana</th>
              <th className="text-left">Acción</th>
            </tr>
          </thead>
          <tbody>
            {phase.preview.map((row, index) => (
              <tr key={`${row.tag}-${index}`}>
                <td>{row.tag}</td>
                <td>
                  {row.action === "crear"
                    ? "Crear"
                    : row.action === "editar"
                      ? row.fields.length > 0
                        ? `Editar: ${row.fields.join(", ")}`
                        : "Editar: sin cambios"
                      : row.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Button type="button" onClick={handleConfirmImport}>
            Confirmar importación
          </Button>
          <Button type="button" variant="outline" onClick={() => setPhase({ step: "upload" })}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (phase.step === "importing") {
    return (
      <p className="text-sm">
        {phase.processed}/{phase.total} filas procesadas
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ImportSummary createdCount={phase.createdCount} updatedCount={phase.updatedCount} errors={phase.errors} />
    </div>
  );
}

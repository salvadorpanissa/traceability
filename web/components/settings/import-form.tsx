"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { ImportColumnMapper } from "@/components/settings/import-column-mapper";
import {
  applyImportColumnMapping,
  type ImportColumnMapping,
  type MappedImportRow,
} from "@/lib/activities/bulk-import-mapping";
import {
  parseImportFileAction,
  importChunkAction,
  type ImportChunkActionResult,
} from "@/app/(protected)/settings/import/actions";

const CHUNK_SIZE = 200;

type Phase =
  | { step: "upload" }
  | { step: "map"; headers: string[]; rows: string[][] }
  | { step: "importing"; total: number; processed: number }
  | { step: "done"; createdCount: number; errors: ImportChunkActionResult["errors"] }
  | {
      step: "error";
      message: string;
      createdCount: number;
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

function ImportSummary({ createdCount, errors }: { createdCount: number; errors: ImportChunkActionResult["errors"] }) {
  return (
    <>
      <p className="text-sm font-medium">{createdCount} filas creadas</p>
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
      setPhase({ step: "error", message: errorMessage(error), createdCount: 0, errors: [], processed: 0, total: 0 });
    } finally {
      setUploading(false);
    }
  }

  async function handleMappingSubmit(mapping: ImportColumnMapping[]) {
    if (phase.step !== "map") return;
    const mappedRows: MappedImportRow[] = applyImportColumnMapping(phase.headers, phase.rows, mapping);
    const { uniqueRows, duplicateRows } = partitionDuplicateTags(mappedRows);
    const duplicateTagErrors: ImportChunkActionResult["errors"] = duplicateRows.map((row) => ({
      tag: row.tag,
      reason: "Caravana duplicada en el archivo",
    }));
    const chunks = chunk(uniqueRows, CHUNK_SIZE);

    setPhase({ step: "importing", total: uniqueRows.length, processed: 0 });

    let createdCount = 0;
    const errors: ImportChunkActionResult["errors"] = [...duplicateTagErrors];
    let processed = 0;

    try {
      for (const rowsChunk of chunks) {
        const result = await importChunkAction(rowsChunk);
        createdCount += result.createdCount;
        errors.push(...result.errors);
        processed += rowsChunk.length;
        setPhase({ step: "importing", total: uniqueRows.length, processed });
      }
    } catch (error) {
      setPhase({
        step: "error",
        message: errorMessage(error),
        createdCount,
        errors,
        processed,
        total: uniqueRows.length,
      });
      return;
    }

    setPhase({ step: "done", createdCount, errors });
  }

  if (phase.step === "upload") {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor="import-file" className="text-sm font-medium">
          Archivo Excel
        </label>
        <FileInput id="import-file" aria-label="Archivo Excel" accept=".xlsx" file={file} onChange={setFile} />
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
        <ImportSummary createdCount={phase.createdCount} errors={phase.errors} />
        <Button type="button" onClick={() => setPhase({ step: "upload" })}>
          Volver a empezar
        </Button>
      </div>
    );
  }

  if (phase.step === "map") {
    return <ImportColumnMapper headers={phase.headers} onSubmit={handleMappingSubmit} />;
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
      <ImportSummary createdCount={phase.createdCount} errors={phase.errors} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImportColumnMapper } from "@/components/settings/import-column-mapper";
import {
  applyImportColumnMapping,
  type ImportColumnMapping,
  type MappedImportRow,
} from "@/lib/activities/bulk-import-mapping";
import { parseImportFileAction, importChunkAction } from "@/app/(protected)/settings/import/actions";

const CHUNK_SIZE = 200;

type Phase =
  | { step: "upload" }
  | { step: "map"; headers: string[]; rows: string[][] }
  | { step: "importing"; total: number; processed: number }
  | { step: "done"; createdCount: number; errors: { tag: string; reason: string }[] };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function ImportForm() {
  const [phase, setPhase] = useState<Phase>({ step: "upload" });
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    const { headers, rows } = await parseImportFileAction(formData);
    setPhase({ step: "map", headers, rows });
  }

  async function handleMappingSubmit(mapping: ImportColumnMapping[]) {
    if (phase.step !== "map") return;
    const mappedRows: MappedImportRow[] = applyImportColumnMapping(phase.headers, phase.rows, mapping);
    const chunks = chunk(mappedRows, CHUNK_SIZE);

    setPhase({ step: "importing", total: mappedRows.length, processed: 0 });

    let createdCount = 0;
    const errors: { tag: string; reason: string }[] = [];
    let processed = 0;

    for (const rowsChunk of chunks) {
      const result = await importChunkAction(rowsChunk);
      createdCount += result.createdCount;
      errors.push(...result.errors);
      processed += rowsChunk.length;
      setPhase({ step: "importing", total: mappedRows.length, processed });
    }

    setPhase({ step: "done", createdCount, errors });
  }

  if (phase.step === "upload") {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor="import-file" className="text-sm font-medium">
          Archivo Excel
        </label>
        <input
          id="import-file"
          aria-label="Archivo Excel"
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" disabled={!file} onClick={handleUpload}>
          Subir
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
      <p className="text-sm font-medium">{phase.createdCount} filas creadas</p>
      {phase.errors.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Caravana</th>
              <th className="text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {phase.errors.map((error, index) => (
              <tr key={`${error.tag}-${index}`}>
                <td>{error.tag}</td>
                <td>{error.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/dictionaries";
import { downloadGuideDocumentAction } from "@/app/(protected)/settings/guides/actions";
import type { GuideDocumentSummary } from "@/lib/dal/guide-documents";

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function GuideDocumentsTable({ rows, locale }: { rows: GuideDocumentSummary[]; locale: Locale }) {
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(batchId: string) {
    setError(null);
    try {
      const file = await downloadGuideDocumentAction(batchId);
      if (!file) {
        setError("No se encontró el archivo de esta guía.");
        return;
      }
      const url = URL.createObjectURL(base64ToBlob(file.base64, file.mimeType));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar la guía. Probá de nuevo.");
    }
  }

  const columns: DataTableColumn<GuideDocumentSummary>[] = [
    {
      key: "createdAt",
      header: "Fecha",
      render: (row) => formatDateTime(row.createdAt),
      sortValue: (row) => new Date(row.createdAt).getTime(),
      searchValue: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "guideNumber",
      header: "Guía",
      render: (row) => row.guideNumber ?? "—",
      sortValue: (row) => row.guideNumber,
      searchValue: (row) => row.guideNumber ?? "",
    },
    {
      key: "originEstablishment",
      header: "Campo origen",
      render: (row) => row.originEstablishmentName ?? "—",
      sortValue: (row) => row.originEstablishmentName,
      searchValue: (row) => row.originEstablishmentName ?? "",
    },
    {
      key: "destinationEstablishment",
      header: "Campo destino",
      render: (row) => row.destinationEstablishmentName,
      sortValue: (row) => row.destinationEstablishmentName,
      searchValue: (row) => row.destinationEstablishmentName,
    },
    {
      key: "animalCount",
      header: "Animales",
      render: (row) => row.animalCount,
      sortValue: (row) => row.animalCount,
    },
    {
      key: "fileName",
      header: "Archivo",
      render: (row) => row.fileName,
      sortValue: (row) => row.fileName,
      searchValue: (row) => row.fileName,
    },
    {
      key: "download",
      header: "",
      render: (row) => (
        <Button type="button" size="sm" variant="outline" onClick={() => handleDownload(row.batchId)}>
          Descargar
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.batchId}
        locale={locale}
        searchable
        searchPlaceholder="Buscar por guía, campo o archivo..."
        emptyMessage="No hay guías cargadas todavía."
      />
    </div>
  );
}

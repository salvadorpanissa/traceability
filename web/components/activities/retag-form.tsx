"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { lookupRetagCandidateAction, confirmRetagAction } from "@/app/(protected)/activities/retag/actions";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

const STATUS_LABEL: Record<string, string> = { dead: "muerta", sold: "vendida" };

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RetagForm({ initialTag, hideContext = false }: { initialTag?: string; hideContext?: boolean }) {
  const [tag, setTag] = useState(initialTag ?? "");
  const [searchedTag, setSearchedTag] = useState<string | null>(null);
  const [state, setState] = useState<AnimalCurrentStateWithNames | null>(null);
  const [searched, setSearched] = useState(false);
  const [eventDate, setEventDate] = useState(todayISODate());
  const [newTag, setNewTag] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSearch(searchTag: string) {
    const trimmed = searchTag.trim();
    if (trimmed.length === 0) return;
    setIsSubmitting(true);
    try {
      const result = await lookupRetagCandidateAction(trimmed);
      setState(result);
      setSearchedTag(trimmed);
      setSearched(true);
      setConfirmed(false);
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Ocurrió un error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (initialTag) {
      void handleSearch(initialTag);
    }
    // Only ever auto-search once, for the tag the page was loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!searchedTag || newTag.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await confirmRetagAction({ tag: searchedTag, newTag: newTag.trim(), eventDate });
      setConfirmed(true);
      toast({ type: "success", title: "Recaravaneo registrado." });
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Ocurrió un error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {hideContext ? null : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="retag-tag">Caravana actual</Label>
          <div className="flex gap-2">
            <Input
              id="retag-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch(tag);
                }
              }}
              className="max-w-xs"
            />
            <Button type="button" onClick={() => void handleSearch(tag)} disabled={isSubmitting || tag.trim().length === 0}>
              Buscar
            </Button>
          </div>
        </div>
      )}

      {searched && !state ? <p className="text-sm text-muted-foreground">No se encontró esa caravana.</p> : null}

      {state && state.status !== "alive" ? (
        <p className="text-sm text-destructive">
          La caravana ya está registrada como {STATUS_LABEL[state.status] ?? state.status}.
        </p>
      ) : null}

      {state && state.status === "alive" && !confirmed ? (
        <div className="flex flex-col gap-4">
          {hideContext ? null : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Campo</dt>
              <dd>{state.establishmentName ?? "Sin campo"}</dd>
              <dt className="text-muted-foreground">Potrero</dt>
              <dd>{state.paddockName ?? "Sin potrero"}</dd>
              <dt className="text-muted-foreground">Categoría</dt>
              <dd>{state.categoryName ?? "Sin categoría"}</dd>
            </dl>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="retag-date">Fecha</Label>
            <Input
              id="retag-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={hideContext ? "w-full" : "max-w-xs"}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="retag-new-tag">Caravana nueva</Label>
            <Input
              id="retag-new-tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className={hideContext ? "w-full" : "max-w-xs"}
            />
          </div>

          <Button
            type="button"
            disabled={isSubmitting || !eventDate || newTag.trim().length === 0}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </div>
      ) : null}

      {confirmed ? <p>Recaravaneo registrado.</p> : null}
    </div>
  );
}

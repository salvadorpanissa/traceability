"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupDeathCandidateAction, confirmDeathAction } from "@/app/(protected)/activities/death/actions";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

const STATUS_LABEL: Record<string, string> = { dead: "muerta", sold: "vendida" };

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DeathForm({ initialTag }: { initialTag?: string }) {
  const [tag, setTag] = useState(initialTag ?? "");
  const [searchedTag, setSearchedTag] = useState<string | null>(null);
  const [state, setState] = useState<AnimalCurrentStateWithNames | null>(null);
  const [searched, setSearched] = useState(false);
  const [eventDate, setEventDate] = useState(todayISODate());
  const [cause, setCause] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSearch(searchTag: string) {
    const trimmed = searchTag.trim();
    if (trimmed.length === 0) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await lookupDeathCandidateAction(trimmed);
      setState(result);
      setSearchedTag(trimmed);
      setSearched(true);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
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
    if (!searchedTag) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await confirmDeathAction({ tag: searchedTag, eventDate, cause: cause.trim() || null });
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="death-tag">Caravana</Label>
        <div className="flex gap-2">
          <Input
            id="death-tag"
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

      {searched && !state ? <p className="text-sm text-muted-foreground">No se encontró esa caravana.</p> : null}

      {state && state.status !== "alive" ? (
        <p className="text-sm text-destructive">
          La caravana ya está registrada como {STATUS_LABEL[state.status] ?? state.status}.
        </p>
      ) : null}

      {state && state.status === "alive" && !confirmed ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Campo</dt>
            <dd>{state.farmName ?? "Sin campo"}</dd>
            <dt className="text-muted-foreground">Potrero</dt>
            <dd>{state.paddockName ?? "Sin potrero"}</dd>
            <dt className="text-muted-foreground">Categoría</dt>
            <dd>{state.categoryName ?? "Sin categoría"}</dd>
          </dl>

          <div className="flex flex-col gap-2">
            <Label htmlFor="death-date">Fecha</Label>
            <Input id="death-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="max-w-xs" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="death-cause">Causa</Label>
            <Input id="death-cause" value={cause} onChange={(e) => setCause(e.target.value)} className="max-w-md" />
          </div>

          <Button type="button" disabled={isSubmitting || !eventDate} onClick={handleConfirm}>
            Confirmar
          </Button>
        </div>
      ) : null}

      {confirmed ? <p>Muerte registrada.</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

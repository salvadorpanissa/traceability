"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { lookupWeighCandidateAction, confirmSingleWeighAction } from "@/app/(protected)/activities/pesaje/actions";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WeighForm({ initialTag, hideContext = false }: { initialTag?: string; hideContext?: boolean }) {
  const [tag, setTag] = useState(initialTag ?? "");
  const [searchedTag, setSearchedTag] = useState<string | null>(null);
  const [state, setState] = useState<AnimalCurrentStateWithNames | null>(null);
  const [searched, setSearched] = useState(false);
  const [eventDate, setEventDate] = useState(todayISODate());
  const [weightKg, setWeightKg] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSearch(searchTag: string) {
    const trimmed = searchTag.trim();
    if (trimmed.length === 0) return;
    setIsSubmitting(true);
    try {
      const result = await lookupWeighCandidateAction(trimmed);
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

  const parsedWeightKg = Number(weightKg.replace(",", "."));
  const weightValid = weightKg.trim() !== "" && parsedWeightKg > 0;

  async function handleConfirm() {
    if (!searchedTag || !weightValid) return;
    setIsSubmitting(true);
    try {
      await confirmSingleWeighAction({ tag: searchedTag, eventDate, weightKg: weightKg.replace(",", ".") });
      setConfirmed(true);
      toast({ type: "success", title: "Pesaje registrado." });
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
          <Label htmlFor="weigh-tag">Caravana</Label>
          <div className="flex gap-2">
            <Input
              id="weigh-tag"
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
        <p className="text-sm text-destructive">La caravana no está viva; no se puede pesar.</p>
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
            <Label htmlFor="weigh-date">Fecha</Label>
            <Input
              id="weigh-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={hideContext ? "w-full" : "max-w-xs"}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="weigh-weight">Peso (kg)</Label>
            <Input
              id="weigh-weight"
              type="text"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className={hideContext ? "w-full" : "max-w-xs"}
            />
          </div>

          <Button type="button" disabled={isSubmitting || !eventDate || !weightValid} onClick={handleConfirm}>
            Confirmar
          </Button>
        </div>
      ) : null}

      {confirmed ? <p>Pesaje registrado.</p> : null}
    </div>
  );
}

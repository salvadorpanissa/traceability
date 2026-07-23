"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import { lookupAnimalByTagAction } from "@/app/(protected)/dashboard/animal-lookup-actions";
import type { AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  alive: "animalLookup.statusAlive",
  sold: "animalLookup.statusSold",
  dead: "animalLookup.statusDead",
};

function statusLabel(status: string, locale: Locale): string {
  const key = STATUS_LABEL_KEYS[status];
  return key ? translate(locale, key) : status;
}

export function AnimalLookup({ locale }: { locale: Locale }) {
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<{ tag: string; state: AnimalCurrentStateWithNames | null } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const searchedTag = tag.trim();
    if (searchedTag.length === 0) return;
    startTransition(async () => {
      const state = await lookupAnimalByTagAction(searchedTag);
      setResult({ tag: searchedTag, state });
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="animal-lookup-tag">{translate(locale, "animalLookup.title")}</Label>
      <div className="flex gap-2">
        <Input
          id="animal-lookup-tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={translate(locale, "animalLookup.placeholder")}
          className="max-w-xs"
        />
        <Button type="button" onClick={handleSubmit} disabled={isPending || tag.trim().length === 0}>
          {isPending ? translate(locale, "animalLookup.submitPending") : translate(locale, "animalLookup.submit")}
        </Button>
      </div>

      {result ? (
        result.state ? (
          <div className="flex flex-col gap-1 text-sm">
            {result.state.currentTag && result.state.currentTag !== result.tag ? (
              <p className="text-muted-foreground">
                {translate(locale, "animalLookup.tagChanged")} {result.state.currentTag}
              </p>
            ) : null}
            <p>
              {translate(locale, "livestock.farm")}: {result.state.farmName ?? translate(locale, "livestock.noFarm")}
            </p>
            <p>
              {translate(locale, "livestock.paddock")}:{" "}
              {result.state.paddockName ?? translate(locale, "livestock.noPaddock")}
            </p>
            <p>
              {translate(locale, "livestock.category")}:{" "}
              {result.state.categoryName ?? translate(locale, "livestock.noCategory")}
            </p>
            <p>
              {translate(locale, "animalLookup.status")}: {statusLabel(result.state.status, locale)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">{translate(locale, "animalLookup.notFound")}</p>
        )
      ) : null}
    </div>
  );
}

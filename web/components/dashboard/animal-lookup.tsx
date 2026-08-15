"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { lookupAnimalByTagAction } from "@/app/(protected)/dashboard/animal-lookup-actions";

export function AnimalLookup({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [tag, setTag] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const searchedTag = tag.trim();
    if (searchedTag.length === 0) return;
    setNotFound(false);
    startTransition(async () => {
      const state = await lookupAnimalByTagAction(searchedTag);
      if (state) {
        router.push(`/animals/${state.animalId}`);
      } else {
        setNotFound(true);
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="animal-lookup">
      <h2 className="mb-3 text-lg font-semibold">{translate(locale, "animalLookup.title")}</h2>
      <div className="flex gap-2">
        <Input
          id="animal-lookup-tag"
          aria-label={translate(locale, "animalLookup.title")}
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={translate(locale, "animalLookup.placeholder")}
          className="max-w-xs"
        />
        <Button type="button" onClick={handleSubmit} disabled={isPending || tag.trim().length === 0}>
          {isPending ? translate(locale, "animalLookup.submitPending") : translate(locale, "animalLookup.submit")}
        </Button>
      </div>

      {notFound ? <p className="text-muted-foreground">{translate(locale, "animalLookup.notFound")}</p> : null}
    </div>
  );
}

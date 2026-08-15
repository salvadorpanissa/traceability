"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RetagForm } from "@/components/activities/retag-form";
import { DeathForm } from "@/components/activities/death-form";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { sexLabel, statusLabel } from "@/lib/dashboard/animal-labels";
import { formatShortDate, toSentenceCase } from "@/lib/utils";
import { updateAnimalAction } from "@/app/(protected)/animals/actions";
import type { AnimalLookupDetail, AnimalTagHistoryEntry, AnimalHealthNoteEntry } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

export function AnimalDetail({
  animal,
  tagHistory,
  healthNotes,
  owners,
  categories,
  reproductiveStatuses,
  locale,
}: {
  animal: AnimalLookupDetail;
  tagHistory: AnimalTagHistoryEntry[];
  healthNotes: AnimalHealthNoteEntry[];
  owners: OwnerCatalogEntry[];
  categories: CategoryCatalogEntry[];
  reproductiveStatuses: ReproductiveStatusCatalogEntry[];
  locale: Locale;
}) {
  const [categoryId, setCategoryId] = useState(animal.currentCategoryId ?? "");
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [birthDate, setBirthDate] = useState(animal.birthDate ?? "");
  const [ownerId, setOwnerId] = useState(owners.find((o) => o.name === animal.ownerName)?.id ?? "");
  const [secondaryTag, setSecondaryTag] = useState(animal.secondaryTag ?? "");
  const [reproductiveStatusId, setReproductiveStatusId] = useState(animal.reproductiveStatusId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [retagOpen, setRetagOpen] = useState(false);
  const [deathOpen, setDeathOpen] = useState(false);
  const router = useRouter();

  function handleRetagOpenChange(open: boolean) {
    setRetagOpen(open);
    if (!open) router.refresh();
  }

  function handleDeathOpenChange(open: boolean) {
    setDeathOpen(open);
    if (!open) router.refresh();
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateAnimalAction({
      animalId: animal.animalId,
      categoryId: categoryId || null,
      sex: animal.sex,
      breed: breed.trim() || null,
      birthDate: birthDate || null,
      ownerId: ownerId || null,
      secondaryTag: secondaryTag.trim() || null,
      reproductiveStatusId: reproductiveStatusId || null,
    });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error || translate(locale, "animals.saveErrorGeneric"));
      return;
    }
    setSaved(true);
  }

  const currentTag = animal.currentTag ?? "";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/animals" className="inline-flex w-fit items-center gap-1 text-sm underline">
        <ArrowLeft className="size-4" />
        {translate(locale, "animals.backToList")}
      </Link>

      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="flex flex-col gap-6">
          <p className="text-2xl font-semibold">
            {translate(locale, "livestock.tag")}: {animal.currentTag ?? "—"}
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{translate(locale, "animals.establishmentLabel")}</p>
              <p>
                {animal.establishmentName ?? translate(locale, "livestock.noEstablishment")},{" "}
                {animal.paddockName ?? translate(locale, "livestock.noPaddock")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{translate(locale, "animalLookup.sex")}</p>
              <p>{sexLabel(animal.sex, locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{translate(locale, "animalLookup.status")}</p>
              <p>{statusLabel(animal.status, locale)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="animal-detail-category">{translate(locale, "livestock.category")}</Label>
              <select
                id="animal-detail-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">{translate(locale, "livestock.noCategory")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {categoryId && categoryId !== (animal.currentCategoryId ?? "") ? (
                <p className="text-xs text-muted-foreground">{translate(locale, "animals.categoryChangeHint")}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="animal-detail-birth-date">{translate(locale, "animalLookup.birthDate")}</Label>
              <Input id="animal-detail-birth-date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="animal-detail-breed">{translate(locale, "animalLookup.breed")}</Label>
              <Input id="animal-detail-breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="animal-detail-reproductive-status">{translate(locale, "animalLookup.reproductiveStatus")}</Label>
              <select
                id="animal-detail-reproductive-status"
                value={reproductiveStatusId}
                onChange={(e) => setReproductiveStatusId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">{translate(locale, "animalLookup.noReproductiveStatus")}</option>
                {reproductiveStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="animal-detail-owner">{translate(locale, "animalLookup.owner")}</Label>
              <select
                id="animal-detail-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="">{translate(locale, "animalLookup.noOwner")}</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="animal-detail-secondary-tag">{translate(locale, "animalLookup.secondaryTag")}</Label>
              <Input
                id="animal-detail-secondary-tag"
                value={secondaryTag}
                onChange={(e) => setSecondaryTag(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {error ? <p className="col-span-2 text-sm text-destructive">{error}</p> : null}
            {saved ? <p className="col-span-2 text-sm">{translate(locale, "animals.saved")}</p> : null}
          </div>

          <div>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? translate(locale, "animals.saving") : translate(locale, "animals.save")}
            </Button>
          </div>

          {animal.status === "alive" ? (
            <div className="flex gap-4">
              <button type="button" className="text-sm underline" onClick={() => setRetagOpen(true)}>
                {translate(locale, "animals.retag")}
              </button>
              <button type="button" className="text-sm underline" onClick={() => setDeathOpen(true)}>
                {translate(locale, "animalLookup.registerDeath")}
              </button>

              <Dialog open={retagOpen} onOpenChange={handleRetagOpenChange}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{translate(locale, "animals.retag")}</DialogTitle>
                  </DialogHeader>
                  <RetagForm initialTag={currentTag} />
                </DialogContent>
              </Dialog>

              <Dialog open={deathOpen} onOpenChange={handleDeathOpenChange}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{translate(locale, "animalLookup.registerDeath")}</DialogTitle>
                  </DialogHeader>
                  <DeathForm initialTag={currentTag} />
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-xs text-muted-foreground">{translate(locale, "animals.tagHistoryTitle")}</p>
            <table className="w-full text-sm" data-testid="tag-history-table">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1 font-normal">{translate(locale, "livestock.tag")}</th>
                  <th className="pb-1 font-normal">{translate(locale, "animalLookup.secondaryTag")}</th>
                  <th className="pb-1 font-normal">{translate(locale, "animals.tagHistoryValidFrom")}</th>
                </tr>
              </thead>
              <tbody>
                {tagHistory.map((entry) => (
                  <tr key={`${entry.tag}-${entry.validFrom.toISOString()}`}>
                    <td className="py-0.5">{entry.tag}</td>
                    <td className="py-0.5">{entry.secondaryTag ?? "—"}</td>
                    <td className="py-0.5">{formatShortDate(entry.validFrom.toISOString().slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mx-auto w-full max-w-2xl" data-testid="animal-health-notes">
        <h2 className="mb-2 text-sm font-medium">{translate(locale, "animals.healthNotesTitle")}</h2>
        {healthNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translate(locale, "animals.healthNotesEmpty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 font-normal">{translate(locale, "animals.healthNoteProduct")}</th>
                <th className="pb-1 font-normal">{translate(locale, "animals.healthNoteLocation")}</th>
                <th className="pb-1 font-normal">{translate(locale, "animals.healthNoteDate")}</th>
                <th className="pb-1 font-normal">{translate(locale, "animals.healthNoteWithdrawal")}</th>
                <th className="pb-1 font-normal">{translate(locale, "livestock.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {healthNotes.map((entry) => (
                <tr key={`${entry.eventDate}-${entry.notes}`}>
                  <td className="py-1 align-top">{toSentenceCase(entry.productName)}</td>
                  <td className="py-1 align-top">
                    {entry.establishmentName ?? translate(locale, "livestock.noEstablishment")},{" "}
                    {entry.paddockName ?? translate(locale, "livestock.noPaddock")}
                  </td>
                  <td className="py-1 align-top">{formatShortDate(entry.eventDate)}</td>
                  <td className="py-1 align-top">{entry.withdrawalEndDate ? formatShortDate(entry.withdrawalEndDate) : "—"}</td>
                  <td className="py-1 align-top">{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

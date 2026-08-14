"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import { sexLabel, statusLabel } from "@/lib/dashboard/animal-labels";
import { updateAnimalAction } from "@/app/(protected)/animals/actions";
import type { AnimalLookupDetail } from "@/lib/dal/animal-access";
import type { OwnerCatalogEntry } from "@/lib/dal/owner-catalog";
import type { CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import type { ReproductiveStatusCatalogEntry } from "@/lib/dal/reproductive-status-catalog";

export function AnimalEditDialog({
  animal,
  owners,
  categories,
  reproductiveStatuses,
  locale,
  onSaved,
}: {
  animal: AnimalLookupDetail;
  owners: OwnerCatalogEntry[];
  categories: CategoryCatalogEntry[];
  reproductiveStatuses: ReproductiveStatusCatalogEntry[];
  locale: Locale;
  onSaved: (updated: AnimalLookupDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(animal.currentCategoryId ?? "");
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [birthDate, setBirthDate] = useState(animal.birthDate ?? "");
  const [ownerId, setOwnerId] = useState(owners.find((o) => o.name === animal.ownerName)?.id ?? "");
  const [secondaryTag, setSecondaryTag] = useState(animal.secondaryTag ?? "");
  const [reproductiveStatusId, setReproductiveStatusId] = useState(animal.reproductiveStatusId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setCategoryId(animal.currentCategoryId ?? "");
    setBreed(animal.breed ?? "");
    setBirthDate(animal.birthDate ?? "");
    setOwnerId(owners.find((o) => o.name === animal.ownerName)?.id ?? "");
    setSecondaryTag(animal.secondaryTag ?? "");
    setReproductiveStatusId(animal.reproductiveStatusId ?? "");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) resetForm();
    setOpen(nextOpen);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
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
    onSaved(result.animal);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" size="sm" variant="ghost" />}>
        {translate(locale, "animals.edit")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate(locale, "animals.editTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{translate(locale, "livestock.tag")}</p>
            <p>{animal.currentTag ?? "—"}</p>
          </div>
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
            <Label htmlFor="animal-edit-category">{translate(locale, "livestock.category")}</Label>
            <select
              id="animal-edit-category"
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
            <Label htmlFor="animal-edit-birth-date">{translate(locale, "animalLookup.birthDate")}</Label>
            <Input
              id="animal-edit-birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="animal-edit-breed">{translate(locale, "animalLookup.breed")}</Label>
            <Input id="animal-edit-breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="animal-edit-reproductive-status">{translate(locale, "animalLookup.reproductiveStatus")}</Label>
            <select
              id="animal-edit-reproductive-status"
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
            <Label htmlFor="animal-edit-owner">{translate(locale, "animalLookup.owner")}</Label>
            <select
              id="animal-edit-owner"
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
            <Label htmlFor="animal-edit-secondary-tag">{translate(locale, "animalLookup.secondaryTag")}</Label>
            <Input
              id="animal-edit-secondary-tag"
              value={secondaryTag}
              onChange={(e) => setSecondaryTag(e.target.value)}
            />
          </div>

          {error ? <p className="col-span-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            {translate(locale, "animals.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? translate(locale, "animals.saving") : translate(locale, "animals.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

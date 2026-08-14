import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

const SEX_LABEL_KEYS: Record<string, TranslationKey> = {
  male: "animalLookup.sexMale",
  female: "animalLookup.sexFemale",
};

export function sexLabel(sex: string | null, locale: Locale): string {
  const key = sex ? SEX_LABEL_KEYS[sex] : undefined;
  return key ? translate(locale, key) : translate(locale, "animalLookup.noSex");
}

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  alive: "animalLookup.statusAlive",
  sold: "animalLookup.statusSold",
  dead: "animalLookup.statusDead",
};

export function statusLabel(status: string, locale: Locale): string {
  const key = STATUS_LABEL_KEYS[status];
  return key ? translate(locale, key) : status;
}

import { translate, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

const SEX_LABEL_KEYS: Record<string, TranslationKey> = {
  male: "animalLookup.sexMale",
  female: "animalLookup.sexFemale",
};

export function sexLabel(sex: string | null, locale: Locale): string {
  const key = sex ? SEX_LABEL_KEYS[sex] : undefined;
  return key ? translate(locale, key) : translate(locale, "animalLookup.noSex");
}

import { PaddockTagListCard, PaddockTagListItems } from "@/components/activities/paddock-tag-list-card";

export function PaddockMissingList({ tags }: { tags: string[] }) {
  return (
    <PaddockTagListCard colorClassName="border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950">
      <p className="mb-2 font-medium">
        {tags.length === 1
          ? "Hay 1 caravana de este potrero que no está en la sanidad:"
          : `Hay ${tags.length} caravanas de este potrero que no están en la sanidad:`}
      </p>
      <PaddockTagListItems>
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </PaddockTagListItems>
    </PaddockTagListCard>
  );
}

export function PaddockMissingList({ tags }: { tags: string[] }) {
  return (
    <div className="rounded-lg border border-sky-400 bg-sky-50 p-3 text-sm dark:border-sky-700 dark:bg-sky-950">
      <p className="mb-2 font-medium">
        {tags.length === 1
          ? "Hay 1 caravana de este potrero que no está en la sanidad:"
          : `Hay ${tags.length} caravanas de este potrero que no están en la sanidad:`}
      </p>
      <ul className="max-h-40 list-disc overflow-y-auto pl-5">
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </div>
  );
}

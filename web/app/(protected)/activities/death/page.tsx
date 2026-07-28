import { DeathForm } from "@/components/activities/death-form";

export default async function DeathPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Muerte</h1>
      <DeathForm initialTag={tag} />
    </div>
  );
}

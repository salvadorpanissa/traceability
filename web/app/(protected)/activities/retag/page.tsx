import { RetagForm } from "@/components/activities/retag-form";

export default async function RetagPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Recaravaneo</h1>
      <RetagForm initialTag={tag} />
    </div>
  );
}

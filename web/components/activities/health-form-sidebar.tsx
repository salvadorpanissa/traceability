import type { HealthProduct } from "@/lib/activities/health";
import type { ProductCatalogEntry } from "@/lib/dal/product-catalog";

export function HealthFormSidebar({
  establishmentName,
  paddockName,
  products,
  catalog,
}: {
  establishmentName: string | null;
  paddockName: string | null;
  products: HealthProduct[];
  catalog: ProductCatalogEntry[];
}) {
  const productNames = products
    .filter((p) => p.productId)
    .map((p) => catalog.find((c) => c.id === p.productId)?.name ?? "Producto nuevo");

  return (
    <aside className="flex w-full flex-col gap-3 rounded-lg border border-border p-3 text-sm">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Campo</p>
        <p>{establishmentName ?? "—"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Potrero</p>
        <p>{paddockName ?? "—"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Productos aplicados</p>
        {productNames.length > 0 ? (
          <ul className="list-disc pl-4">
            {productNames.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">—</p>
        )}
      </div>
    </aside>
  );
}

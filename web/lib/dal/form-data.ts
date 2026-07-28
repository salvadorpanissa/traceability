// `formData.get(name) as File` is `null` when the field is missing/empty,
// which then throws an unhandled TypeError on the first `.arrayBuffer()`/
// `.name` access. Centralized so every upload action fails with the same
// friendly message instead of a raw crash.
export function requireFile(formData: FormData, name: string): File {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size === 0) {
    throw new Error("Falta el archivo");
  }
  return value;
}

import { runAgeBasedRecategorization } from "@/lib/activities/age-recategorization";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await runAgeBasedRecategorization();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return Response.json({ error: message }, { status: 500 });
  }
}

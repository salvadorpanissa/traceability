import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoScrollHero } from "@/components/onboarding/logo-scroll-hero";

const features = [
  {
    title: "Trazabilidad por caravana",
    description: "Historial completo de cada animal: sanidad, movimientos y ubicación.",
  },
  {
    title: "Movimientos",
    description: "Altas, bajas, traslados, ventas y recategorizaciones en un solo lugar.",
  },
  {
    title: "DICOSE",
    description: "Declaraciones sin duplicar carga de datos.",
  },
  {
    title: "Guías de traslado",
    description: "Se generan desde la misma información del rodeo.",
  },
  {
    title: "Categorías y stock",
    description: "Sabés cuánto tenés y de qué categoría, siempre actualizado.",
  },
  {
    title: "Alertas de novedades",
    description: "Caravanas sin movimientos recientes, para que no se te escapen.",
  },
  {
    title: "Preguntale a la IA",
    description: "Consultas en lenguaje natural sobre tu rodeo.",
  },
];

export default function OnboardingPage() {
  return (
    <div>
      <LogoScrollHero />

      <section className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h2 className="text-3xl font-bold text-balance sm:text-4xl">
          Cada tratamiento, cada caravana, cada plazo.
        </h2>
        <p className="mt-4 text-lg text-balance text-muted-foreground">
          Registrás qué producto recibió cada animal y el sistema calcula solo hasta cuándo no
          puede salir a faena. Nada se pierde en una planilla.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{feature.description}</CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

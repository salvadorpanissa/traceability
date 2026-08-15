import { FileSpreadsheet, History, Receipt, ScanText, Sparkles, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoScrollHero } from "@/components/landing/logo-scroll-hero";

const features = [
  {
    icon: ScanText,
    title: "Lectura inteligente del SNIG",
    description:
      "Olvidate de cargar datos a mano. Subí el PDF de tu Guía Electrónica y el sistema extrae automáticamente todo el anexo de caravanas en un segundo.",
  },
  {
    icon: FileSpreadsheet,
    title: "Del bastón directo a la app",
    description:
      "Subí las planillas Excel que genera tu lector. El sistema reconoce las columnas y procesa cientos de animales al instante.",
  },
  {
    icon: Timer,
    title: "Control de días de carencia",
    description:
      "Registrá la sanidad y el sistema calculará los tiempos de retiro. Recibí alertas si intentás enviar a faena un animal con residuos.",
  },
  {
    icon: Receipt,
    title: "Liquidaciones",
    description:
      "Subí el PDF de la liquidación de la industria. El sistema extrae los kilos y montos reales para asociarlos automáticamente a tu lote.",
  },
  {
    icon: History,
    title: "Historial inmutable",
    description:
      "Cada sanidad, recategorización y traslado queda guardado para siempre. Trazabilidad perfecta y transparente de toda la vida del animal.",
  },
  {
    icon: Sparkles,
    title: "Búsqueda inteligente",
    description:
      "Encontrá la información de tus animales al instante. Usá tus propias palabras para filtrar datos y consultar el estado general del establecimiento.",
  },
];

export default function OnboardingPage() {
  return (
    <div>
      <LogoScrollHero />

      <section className="mx-auto max-w-5xl px-4 py-24">
        <div className="mx-auto mb-12 mt-48 max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-balance sm:text-4xl">
            Diseñado para simplificar tu día a día
          </h2>
          <p className="mt-3 text-muted-foreground text-balance">
            Conocé las herramientas que automatizan la gestión de tu rodeo y te ahorran horas de
            trabajo.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="mb-1 size-6 text-primary" />
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

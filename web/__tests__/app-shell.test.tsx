import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";
import { LocaleProvider } from "@/lib/i18n/context";

describe("AppShell", () => {
  it("shows the active farm name and user name", () => {
    render(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado Norte" activeFarmName="Campo Norte">
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("Encargado Norte")).toBeInTheDocument();
    expect(screen.getByText("Cambiar campo")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});

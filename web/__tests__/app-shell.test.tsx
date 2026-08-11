import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/app-shell";
import { LocaleProvider } from "@/lib/i18n/context";

let mockedPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <span>theme-toggle</span>,
}));

afterEach(cleanup);

describe("AppShell", () => {
  it("shows navigation, user name, and the user menu items", async () => {
    mockedPathname = "/activities/health";

    render(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado Norte">
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    const user = userEvent.setup();
    const userButton = screen.getByRole("button", { name: "Menú de usuario" });
    const activeNavLink = screen.getByRole("link", { name: "Sanidad" });

    expect(screen.getByText("theme-toggle")).toBeInTheDocument();
    expect(activeNavLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Registro de Caravanas" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recategorización" })).toHaveAttribute("href", "/activities/recategorize");
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();

    const settingsLink = screen.getByRole("link", { name: "Configuración del campo" });
    expect(settingsLink).toHaveAttribute("href", "/settings");

    await user.click(userButton);

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("only marks Liquidación as active on /activities/sale-settlement, not Venta", async () => {
    mockedPathname = "/activities/sale-settlement";

    render(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado Norte">
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    expect(screen.getByRole("link", { name: "Liquidación" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Venta" })).not.toHaveAttribute("aria-current", "page");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/app-shell";
import { LocaleProvider } from "@/lib/i18n/context";

let mockedPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

vi.mock("@/components/settings-menu", () => ({
  SettingsMenu: () => <span>settings-menu</span>,
}));

afterEach(cleanup);

describe("AppShell", () => {
  it("shows navigation, user name, and logout menu", async () => {
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
    const activeNavLink = screen.getByRole("link", { name: "Sanidades" });

    expect(screen.getByText("settings-menu")).toBeInTheDocument();
    expect(activeNavLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Cambiar campo" })).not.toBeInTheDocument();

    await user.click(userButton);

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});

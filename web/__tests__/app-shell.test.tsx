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
  it("shows navigation, active farm selector, user name, and logout menu", async () => {
    mockedPathname = "/activities/health";
    const onFarmChange = async () => {};

    render(
      <LocaleProvider initialLocale="es">
        <AppShell
          userName="Encargado Norte"
          activeFarmId="farm-norte"
          selectableFarms={[
            { id: "farm-norte", name: "Campo Norte" },
            { id: "farm-sur", name: "Campo Sur" },
          ]}
          onFarmChange={onFarmChange}
        >
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    const user = userEvent.setup();
    const desktopFarmSelector = screen.getByRole("combobox", { name: "Cambiar campo" });
    const userButton = screen.getByRole("button", { name: "Menú de usuario" });
    const activeNavLink = screen.getByRole("link", { name: "Sanidades" });

    expect(screen.getByText("settings-menu")).toBeInTheDocument();
    expect(desktopFarmSelector).toHaveValue("farm-norte");
    expect(screen.getByRole("option", { name: "Campo Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Campo Sur" })).toBeInTheDocument();
    expect(activeNavLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();

    await user.click(userButton);

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("updates the farm selector's displayed value when activeFarmId changes on a re-render", () => {
    mockedPathname = "/dashboard";
    const onFarmChange = async () => {};
    const farms = [
      { id: "farm-norte", name: "Campo Norte" },
      { id: "farm-sur", name: "Campo Sur" },
    ];

    const { rerender } = render(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado" activeFarmId="farm-norte" selectableFarms={farms} onFarmChange={onFarmChange}>
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    expect(screen.getByRole("combobox", { name: "Cambiar campo" })).toHaveValue("farm-norte");

    // Simulates the server passing a fresh activeFarmId after the farm-change
    // Server Action completes and the layout re-renders — without the
    // select being a controlled component, its displayed value would stay
    // stuck on the old farm until a full page reload.
    rerender(
      <LocaleProvider initialLocale="es">
        <AppShell userName="Encargado" activeFarmId="farm-sur" selectableFarms={farms} onFarmChange={onFarmChange}>
          <p>contenido</p>
        </AppShell>
      </LocaleProvider>
    );

    expect(screen.getByRole("combobox", { name: "Cambiar campo" })).toHaveValue("farm-sur");
  });
});

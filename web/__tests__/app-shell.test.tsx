import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/app-shell";
import { LocaleProvider } from "@/lib/i18n/context";

describe("AppShell", () => {
  it("shows the active farm selector, user name, and logout dropdown", async () => {
    const onFarmChange = async () => {};

    render(
      <LocaleProvider initialLocale="es">
        <AppShell
          userName="Encargado Norte"
          activeFarmId="farm-norte"
          activeFarmName="Campo Norte"
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
    const farmSelector = screen.getByRole("combobox", { name: "Cambiar campo" });
    const userSummary = screen.getByText("Encargado Norte");
    const userMenu = userSummary.closest("details");

    expect(screen.getByText("Campo Norte", { selector: "span" })).toBeInTheDocument();
    expect(farmSelector).toHaveValue("farm-norte");
    expect(screen.getByRole("option", { name: "Campo Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Campo Sur" })).toBeInTheDocument();
    expect(userSummary).toBeInTheDocument();
    expect(userMenu).not.toHaveAttribute("open");

    await user.click(userSummary);

    expect(userMenu).toHaveAttribute("open");
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});

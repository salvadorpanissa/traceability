import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/lib/i18n/context";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

function Probe() {
  const { t } = useLocale();
  return <span>{t("appShell.logout")}</span>;
}

describe("i18n", () => {
  it("translate returns the default locale text", () => {
    expect(translate("es", "login.email")).toBe("Email");
  });

  it("parseLocaleCookie rejects unknown values", () => {
    expect(parseLocaleCookie("fr")).toBe("es");
    expect(parseLocaleCookie(undefined)).toBe("es");
    expect(parseLocaleCookie("es")).toBe("es");
  });

  it("provides translated text via context", () => {
    render(
      <LocaleProvider initialLocale="es">
        <Probe />
      </LocaleProvider>
    );

    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
  });
});

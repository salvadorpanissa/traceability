import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider, useLocale } from "@/lib/i18n/context";
import { parseLocaleCookie, translate } from "@/lib/i18n/dictionaries";

function Probe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span>{t("appShell.logout")}</span>
      <button onClick={() => setLocale(locale === "es" ? "en" : "es")}>toggle</button>
    </div>
  );
}

describe("i18n", () => {
  it("translate falls back to the default locale for a missing key", () => {
    expect(translate("en", "login.email")).toBe("Email");
  });

  it("parseLocaleCookie rejects unknown values", () => {
    expect(parseLocaleCookie("fr")).toBe("es");
    expect(parseLocaleCookie(undefined)).toBe("es");
    expect(parseLocaleCookie("en")).toBe("en");
  });

  it("switches translated text and persists the choice in a cookie", async () => {
    document.cookie = "locale=; max-age=0";
    render(
      <LocaleProvider initialLocale="es">
        <Probe />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();

    await user.click(screen.getByText("toggle"));

    expect(screen.getByText("Log out")).toBeInTheDocument();
    expect(document.cookie).toContain("locale=en");
  });
});

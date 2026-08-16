import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/login-form";
import { LocaleProvider } from "@/lib/i18n/context";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const googleSignInActionMock = vi.fn(async () => undefined);

vi.mock("@/app/login/actions", () => ({
  loginAction: vi.fn(async () => ({ error: "Email o contraseña incorrectos" })),
  googleSignInAction: (...args: unknown[]) => googleSignInActionMock(...args),
}));

describe("LoginForm", () => {
  it("shows the server error after a failed submit", async () => {
    render(
      <LocaleProvider initialLocale="es">
        <LoginForm />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "bad@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "wrong");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByText("Email o contraseña incorrectos")).toBeInTheDocument();
  });

  it("submits the Google button with the current returnTo", async () => {
    render(
      <LocaleProvider initialLocale="es">
        <LoginForm />
      </LocaleProvider>
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(googleSignInActionMock).toHaveBeenCalledWith("/dashboard");
  });
});

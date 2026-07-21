import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  it("shows the active farm name and user name", () => {
    render(
      <AppShell userName="Encargado Norte" activeFarmName="Campo Norte">
        <p>contenido</p>
      </AppShell>
    );

    expect(screen.getByText("Campo Norte")).toBeInTheDocument();
    expect(screen.getByText("Encargado Norte")).toBeInTheDocument();
    expect(screen.getByText("Cambiar campo")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

let mockedPathname = "/settings/dicose";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

afterEach(cleanup);

describe("SettingsSidebar", () => {
  it("lists every settings section and marks the current one as active", () => {
    mockedPathname = "/settings/products";

    render(<SettingsSidebar />);

    expect(screen.getByRole("link", { name: "DICOSE" })).toHaveAttribute("href", "/settings/dicose");
    expect(screen.getByRole("link", { name: "Caravanas propias" })).toHaveAttribute("href", "/settings/own-tags");
    expect(screen.getByRole("link", { name: "Potreros" })).toHaveAttribute("href", "/settings/paddocks");
    expect(screen.getByRole("link", { name: "Categorías" })).toHaveAttribute("href", "/settings/categories");

    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Potreros" })).not.toHaveAttribute("aria-current");
  });
});

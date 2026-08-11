import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileInput } from "@/components/ui/file-input";

function Harness() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <FileInput file={file} onChange={setFile} />
      <button onClick={() => setFile(null)}>reset</button>
    </>
  );
}

describe("FileInput", () => {
  it("shows an empty-state message until a file is chosen, and again after an external reset", async () => {
    render(<Harness />);
    const user = userEvent.setup();

    expect(screen.getByText("Ningún archivo seleccionado todavía")).toBeInTheDocument();

    const input = screen.getByDisplayValue("") as HTMLInputElement;
    const file = new File(["contenido"], "guia.pdf", { type: "application/pdf" });
    await user.upload(input, file);

    expect(screen.getByText("guia.pdf")).toBeInTheDocument();
    expect(input.value).not.toBe("");

    await user.click(screen.getByRole("button", { name: "reset" }));

    expect(screen.getByText("Ningún archivo seleccionado todavía")).toBeInTheDocument();
    expect(input.value).toBe("");
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/shared/api/client";
import { RenameField } from "./RenameField";

describe("nomni o'zgartirish", () => {
  it("o'zgartiradi, bo'sh joylarni olib tashlaydi va yana oddiy ko'rinishga qaytadi", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<RenameField label="Biznes nomi" value="Shavkat aka" onSave={save} />);

    await userEvent.click(screen.getByRole("button", { name: "O'zgartirish" }));
    const input = screen.getByLabelText("Biznes nomi");
    await userEvent.clear(input);
    await userEvent.type(input, "  Shavkat aka matolari ");
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));

    expect(save).toHaveBeenCalledWith("Shavkat aka matolari");
    expect(await screen.findByRole("button", { name: "O'zgartirish" })).toBeInTheDocument();
  });

  it("juda qisqa nomni yubormaydi; server xatosini ko'rsatadi va forma ochiq qoladi", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "forbidden"));
    render(<RenameField label="Ism" value="Shavkat M" onSave={save} />);
    await userEvent.click(screen.getByRole("button", { name: "O'zgartirish" }));
    const input = screen.getByLabelText("Ism");

    await userEvent.clear(input);
    await userEvent.type(input, "S");
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Kamida 2 ta belgi kiriting")).toBeInTheDocument();

    await userEvent.type(input, "havkat");
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));
    expect(save).toHaveBeenCalledWith("Shavkat");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Ism")).toBeInTheDocument();
  });

  it("o'zgarmagan nom saqlanmaydi — shunchaki yopiladi", async () => {
    const save = vi.fn();
    render(<RenameField label="Ism" value="Shavkat M" onSave={save} />);
    await userEvent.click(screen.getByRole("button", { name: "O'zgartirish" }));
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "O'zgartirish" })).toBeInTheDocument();
  });
});

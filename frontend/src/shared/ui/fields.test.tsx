import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatPhone, PhoneField } from "./fields";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <PhoneField label="Telefon raqami" value={value} onChange={setValue} />
      <output data-testid="digits">{value}</output>
    </>
  );
}

describe("telefon maydoni", () => {
  it("raqamlarni o'qishga qulay guruhlaydi", () => {
    expect(formatPhone("901234567")).toBe("90 123 45 67");
    expect(formatPhone("9012")).toBe("90 12");
    expect(formatPhone("")).toBe("");
  });

  it("faqat raqamlarni qabul qiladi va 9 tadan oshirmaydi", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Telefon raqami");

    await userEvent.type(input, "90a 123-45-67 99");

    expect(input).toHaveValue("90 123 45 67");
    expect(screen.getByTestId("digits")).toHaveTextContent("901234567");
  });

  it("to'liq raqam qo'yilsa (+998 ...) mamlakat kodini olib tashlaydi", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Telefon raqami");

    await userEvent.click(input);
    await userEvent.paste("+998 90 111 22 33");

    expect(screen.getByTestId("digits")).toHaveTextContent("901112233");
  });
});

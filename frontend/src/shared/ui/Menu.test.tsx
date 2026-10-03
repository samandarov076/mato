import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Eye, Power } from "lucide-react";
import { ActionMenu, MenuItem } from "./Menu";

function renderMenu(onShow = vi.fn(), onOff = vi.fn()) {
  render(
    <div>
      <button>oldingi</button>
      <ActionMenu label="Nodira Yusupova: boshqa amallar">
        <MenuItem icon={Eye} onSelect={onShow}>PIN'ni ko'rish</MenuItem>
        <MenuItem onSelect={() => {}} disabled>PIN'ni almashtirish</MenuItem>
        <MenuItem icon={Power} tone="danger" onSelect={onOff}>Faolsizlantirish</MenuItem>
      </ActionMenu>
    </div>,
  );
  return { onShow, onOff, trigger: screen.getByRole("button", { name: "Nodira Yusupova: boshqa amallar" }) };
}

describe("amallar menyusi (⋯)", () => {
  it("yopiq turadi; bosilganda ochiladi va birinchi amal fokus oladi", async () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "PIN'ni ko'rish" })).toHaveFocus();
  });

  it("klaviatura: strelkalar bilan yuriladi (o'chirilgani o'tkazib yuboriladi), Esc yopadi va fokusni qaytaradi", async () => {
    const { trigger } = renderMenu();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Faolsizlantirish" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}"); // oxiridan — boshiga
    expect(screen.getByRole("menuitem", { name: "PIN'ni ko'rish" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Faolsizlantirish" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("amal tanlansa — bajariladi, menyu yopiladi, fokus tugmaga qaytadi", async () => {
    const { onShow, onOff, trigger } = renderMenu();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Faolsizlantirish" }));

    expect(onOff).toHaveBeenCalledTimes(1);
    expect(onShow).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("tashqariga bosilsa yopiladi", async () => {
    const { trigger } = renderMenu();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "oldingi" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

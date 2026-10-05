import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransferStatusChip } from "@/modules/inventory/TransfersPage";
import { SaleStatusChip } from "./SalesPage";

// docs/06-dizayn-va-sezgi.md: bekor qilingan hujjat — qizil (madder), kulrang emas
describe("holat yorliqlari: bekor qilingan — qizil", () => {
  it("bekor qilingan sotuv", () => {
    render(<SaleStatusChip status="cancelled" />);
    expect(screen.getByText("Bekor qilingan")).toHaveClass("text-madder");
  });

  it("bekor qilingan ko'chirish", () => {
    render(<TransferStatusChip status="cancelled" hasDiff={false} />);
    expect(screen.getByText("Bekor qilingan")).toHaveClass("text-madder");
  });

  it("qolgan holatlar o'z rangida qoladi", () => {
    render(<SaleStatusChip status="completed" />);
    render(<TransferStatusChip status="in_transit" hasDiff={false} />);
    expect(screen.getByText("Yakunlangan")).toHaveClass("text-leaf");
    expect(screen.getByText("Yo'lda")).toHaveClass("text-saffron");
  });
});

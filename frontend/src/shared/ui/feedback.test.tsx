import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Alert } from "./feedback";

function Page({ load }: { load: () => Promise<string> }) {
  const data = useQuery({ queryKey: ["page"], queryFn: load, retry: false });
  if (data.isError) return <Alert>Serverga ulanib bo'lmadi</Alert>;
  return <p>{data.data ?? "yuklanmoqda"}</p>;
}

describe("xato banneri", () => {
  it("so'rov xato bersa — 'Qayta urinish' tugmasi shu so'rovni qayta yuboradi", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ro'yxat keldi");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page load={load} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Serverga ulanib bo'lmadi");
    await userEvent.click(screen.getByRole("button", { name: "Qayta urinish" }));

    expect(await screen.findByText("ro'yxat keldi")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("forma xatosida (xato bergan so'rov yo'q) tugma chiqmaydi", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Alert>1 metr narxini kiriting</Alert>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("1 metr narxini kiriting");
    expect(screen.queryByRole("button", { name: "Qayta urinish" })).toBeNull();
  });

  it("so'rovlar muhitisiz ham ishlaydi; muvaffaqiyat xabarida tugma yo'q", () => {
    render(<Alert tone="success">Saqlandi</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Saqlandi");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

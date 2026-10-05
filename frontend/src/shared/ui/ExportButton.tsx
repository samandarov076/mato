import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { downloadFile } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Button } from "./Button";

/** Hisobotni Excel faylida yuklab olish. `path` — so'rov bilan: "/reports/sales/export?date_from=..." */
export function ExportButton({ path }: { path: string }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(path);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-madder">
          {error}
        </span>
      )}
      <Button variant="secondary" size="sm" loading={busy} onClick={() => void save()}>
        {!busy && <Download className="size-4" aria-hidden="true" />}
        {t("reports.excel")}
      </Button>
    </span>
  );
}

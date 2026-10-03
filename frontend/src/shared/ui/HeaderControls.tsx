import { useTranslation } from "react-i18next";
import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { feedback, setFeedbackPrefs, useFeedbackPrefs } from "@/shared/feedback";
import { useTheme } from "@/shared/theme";
import { HeaderLanguage } from "./HeaderLanguage";
import { iconButton } from "./Button";
import { InstallIconButton } from "./InstallApp";


/** Tovush: bir bosishda o'chadi/yonadi (sozlama qurilmada saqlanadi) */
export function SoundToggle() {
  const { t } = useTranslation();
  const { sound } = useFeedbackPrefs();
  return (
    <button
      type="button"
      aria-label={t(sound ? "feedback.mute" : "feedback.unmute")}
      aria-pressed={sound}
      onClick={(event) => {
        setFeedbackPrefs({ sound: !sound });
        if (!sound) feedback("toggle", event, { on: true });
      }}
      className={iconButton}
    >
      {sound ? <Volume2 className="size-5" aria-hidden="true" /> : <VolumeX className="size-5" aria-hidden="true" />}
    </button>
  );
}

/** Kunduzgi / tungi rejim (qurilmada saqlanadi) */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={(event) => {
        feedback("toggle", event, { on: theme !== "dark" });
        toggle();
      }}
      aria-label={t(theme === "dark" ? "theme.to_light" : "theme.to_dark")}
      className={iconButton}
    >
      {theme === "dark" ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
    </button>
  );
}

/**
 * Har ekranning yuqori o'ng burchagi: til, tovush, tungi rejim, ilovani o'rnatish — kirishdan oldin ham, keyin
 * ham bir xil joyda va bir xil ko'rinishda (til — belgi + "UZ", joy tejaydi). O'rnatish belgisi telefonda
 * ko'rinmaydi (sarlavhada joy tor) — telefonda kirish sahifasidagi katta tugma bor.
 */
export function HeaderControls() {
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <HeaderLanguage />
      <SoundToggle />
      <ThemeToggle />
      <div className="hidden sm:block">
        <InstallIconButton />
      </div>
    </div>
  );
}

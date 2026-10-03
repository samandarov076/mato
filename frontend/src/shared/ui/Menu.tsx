import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { actionClass } from "./list";
import { focusRing } from "./tones";

const MenuContext = createContext<{ close: () => void } | null>(null);

/**
 * Qatordagi kam ishlatiladigan amallar — "⋯" tugmasi ortida (qator bitta-ikkita tugma bilan toza turadi).
 * Klaviatura: Enter/bo'shliq — ochadi (birinchi amal fokus oladi), strelkalar / Home / End — yuradi,
 * Esc — yopadi; yopilganda fokus tugmaga qaytadi. Menyu ekranga nisbatan joylashadi (`fixed`) — ro'yxat
 * kartochkasining chetida qirqilib qolmaydi; pastda joy bo'lmasa tepaga ochiladi.
 */
export function ActionMenu({
  label,
  children,
  triggerRef,
}: {
  /** Tugma nomi (ekran o'quvchi uchun): "Nodira Yusupova: boshqa amallar" */
  label: string;
  children: ReactNode;
  /** Tugmaga tashqaridan ham murojaat (tasdiq yopilganda fokusni qaytarish uchun) */
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  };

  // Ochilganda: joylashuv (tugma ostida, o'ng chetiga tekis) va birinchi amalga fokus
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight;
    const below = window.innerHeight - anchor.bottom;
    setStyle({
      right: Math.max(8, window.innerWidth - anchor.right),
      ...(below < height + 12 && anchor.top > below
        ? { bottom: window.innerHeight - anchor.top + 4 }
        : { top: anchor.bottom + 4 }),
    });
    items()[0]?.focus({ preventScroll: true });
  }, [open]);

  // Tashqariga bosilsa, sahifa surilsa yoki oyna o'lchami o'zgarsa — yopiladi
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const away = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: (index + 1) % list.length,
      ArrowUp: (index - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      list[moves[event.key]]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false); // fokus tabiiy tartibda davom etadi
    }
  }

  return (
    <>
      <button
        ref={(element) => {
          trigger.current = element;
          if (typeof triggerRef === "function") triggerRef(element);
          else if (triggerRef) (triggerRef as { current: HTMLButtonElement | null }).current = element;
        }}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          feedback("tap", event);
          setOpen(!open);
        }}
        className={`${actionClass()} justify-center px-2`}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={style}
          className="fixed z-40 min-w-52 animate-rise rounded-control border border-line bg-panel p-1 shadow-pop"
        >
          <MenuContext.Provider value={{ close: () => close() }}>{children}</MenuContext.Provider>
        </div>
      )}
    </>
  );
}

/** Menyudagi amal. Tanlanganda menyu yopiladi va fokus "⋯" tugmasiga qaytadi, keyin amal bajariladi. */
export function MenuItem({
  icon: Icon,
  tone = "default",
  disabled = false,
  onSelect,
  children,
}: {
  icon?: LucideIcon;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      tabIndex={-1}
      onClick={(event) => {
        feedback(tone === "danger" ? "warning" : "tap", event);
        menu?.close();
        onSelect();
      }}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm disabled:opacity-50 [@media(pointer:coarse)]:min-h-11 ${focusRing} ${
        tone === "danger"
          ? "text-madder hover:bg-madder-soft focus-visible:bg-madder-soft"
          : "text-ink hover:bg-indigo-soft focus-visible:bg-indigo-soft"
      }`}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

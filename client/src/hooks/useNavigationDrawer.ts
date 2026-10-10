import { useEffect, useRef, useState } from "react";

/** Keep the mobile drawer modal for keyboard and assistive-technology users. */
export function useNavigationDrawer(open: boolean, close: () => void) {
  const drawer = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(true);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setMobile(!query.matches);
      if (query.matches) closeRef.current();
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const element = drawer.current;
    const opener = document.activeElement as HTMLElement | null;
    const path = window.location.pathname;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(element?.querySelectorAll<HTMLElement>(
      'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    ) || []).filter(e => e.getClientRects().length > 0);
    controls()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const all = controls(), first = all[0], last = all.at(-1);
      if (e.shiftKey && (document.activeElement === first || !element?.contains(document.activeElement))) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !element?.contains(document.activeElement))) {
        e.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = oldOverflow;
      if (opener?.isConnected && window.location.pathname === path) opener.focus();
    };
  }, [open, mobile]);
  return { drawer, mobile };
}

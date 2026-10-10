import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function RouteAccessibility() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    let current: HTMLElement | null = null;
    let contentObserver: MutationObserver | null = null;
    let focused = false;
    const attach = () => {
      const main = document.getElementById("main-content");
      if (main === current) return;
      contentObserver?.disconnect();
      current = main;
      if (!main) return;
      if (!focused) {
        main.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "instant" });
        focused = true;
      }
      const update = () => {
        const heading = main.querySelector("h1")?.textContent?.trim() || "Disha360 workspace";
        document.title = `${heading} · Disha360`;
        setAnnouncement(heading);
        main.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach(region => {
          if (!region.querySelector("table")) return;
          region.tabIndex = 0;
          region.setAttribute("role", "region");
          region.setAttribute("aria-label", `${region.closest("section")?.querySelector("h2,h3")?.textContent || "Data table"} — scroll horizontally if needed`);
        });
        main.querySelectorAll("thead th").forEach(th => th.setAttribute("scope", "col"));
      };
      update();
      contentObserver = new MutationObserver(update);
      contentObserver.observe(main, { childList: true, subtree: true, characterData: true });
    };
    // Protected routes initially render a session-loading state without a main.
    // Observe mounting/replacement too, so direct links and refresh are covered.
    const mountObserver = new MutationObserver(attach);
    mountObserver.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => { mountObserver.disconnect(); contentObserver?.disconnect(); };
  }, [pathname]);
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>;
}

import { useEffect, useState } from "react";

export const FOUNDER_KEY = "lk_founder";
const FOUNDER_PARAM = "founder";

/**
 * Founder-mode gating (two-faces restructure §5).
 * Founder mode is a local-only flag: `localStorage['lk_founder'] === '1'`.
 * A `?founder=1` URL param on any route persists it across visits.
 * No founder block may render unless this returns true.
 */
export function readFounderMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FOUNDER_KEY) === "1";
}

export function enableFounderMode(): void {
  window.localStorage.setItem(FOUNDER_KEY, "1");
  window.dispatchEvent(new CustomEvent("lk:founder"));
}

export function disableFounderMode(): void {
  window.localStorage.removeItem(FOUNDER_KEY);
  window.dispatchEvent(new CustomEvent("lk:founder"));
}

export function useFounderMode(): boolean {
  const [founder, setFounder] = useState<boolean>(readFounderMode);

  useEffect(() => {
    // ?founder=1 anywhere (e.g. /#/task/t05-threshold-guardian?founder=1) enables it.
    try {
      const hash = window.location.hash || "";
      const qIndex = hash.indexOf("?");
      if (qIndex >= 0) {
        const params = new URLSearchParams(hash.slice(qIndex + 1));
        const v = params.get(FOUNDER_PARAM);
        if (v === "1") {
          enableFounderMode();
          setFounder(true);
        } else if (v === "0") {
          disableFounderMode();
          setFounder(false);
        }
      }
    } catch {
      /* malformed hash — founder mode unchanged */
    }
    const sync = () => setFounder(readFounderMode());
    window.addEventListener("lk:founder", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lk:founder", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return founder;
}

/**
 * Noindex guard: when founder mode is active, keep founder surfaces out of
 * search indexes. Removes the tag when founder mode is left.
 */
export function useFounderNoindex(active: boolean): void {
  useEffect(() => {
    const TAG_ID = "lk-founder-noindex";
    if (!active) {
      document.getElementById(TAG_ID)?.remove();
      return;
    }
    let tag = document.getElementById(TAG_ID) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.id = TAG_ID;
      tag.name = "robots";
      tag.content = "noindex,nofollow";
      document.head.appendChild(tag);
    }
    return () => {
      document.getElementById(TAG_ID)?.remove();
    };
  }, [active]);
}

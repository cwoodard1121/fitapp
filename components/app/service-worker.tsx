"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable and the shell works
 * offline. No-op in dev / unsupported browsers. Rendered once in the root layout.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore registration failures */
      });
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

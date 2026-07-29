import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installConsoleCapture } from "./lib/clientMeta";

installConsoleCapture();

// Auto-reload when a stale dynamic chunk (from a previous deploy) fails to load.
const CHUNK_RELOAD_KEY = "__chunk_reload_at";
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
    msg,
  );
const maybeReload = () => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    if (Date.now() - last < 10_000) return; // avoid reload loop
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  } catch {
    window.location.reload();
  }
};
window.addEventListener("error", (e) => {
  if (e?.message && isChunkLoadError(e.message)) maybeReload();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e?.reason && (e.reason.message || e.reason)) || "");
  if (isChunkLoadError(msg)) maybeReload();
});

createRoot(document.getElementById("root")!).render(<App />);

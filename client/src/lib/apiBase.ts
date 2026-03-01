// client/src/lib/apiBase.ts

// Read environment variable for web builds (Vite)
const rawEnv = import.meta.env.VITE_API_BASE;

// Detect if running inside a native Capacitor app
const isCapacitor =
  typeof window !== "undefined" &&
  (window as any).Capacitor &&
  typeof (window as any).Capacitor.isNativePlatform === "function" &&
  (window as any).Capacitor.isNativePlatform();

// Production backend (Render)
const RENDER_BASE = "https://brain-trip-planner.onrender.com";

// Final base selection logic:
// - Native app (TestFlight) → ALWAYS use Render
// - Web build with env var → use env var
// - Otherwise → fallback to Render (not relative path)
const base = isCapacitor
  ? RENDER_BASE
  : rawEnv
  ? rawEnv
  : RENDER_BASE;

// Remove trailing slash
export const API_BASE = base.replace(/\/+$/, "");

// Helpful debug log
console.log("Using API_BASE:", API_BASE);
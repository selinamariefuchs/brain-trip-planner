const raw = import.meta.env.VITE_API_BASE || "";
export const API_BASE = raw.replace(/\/+$/, "");

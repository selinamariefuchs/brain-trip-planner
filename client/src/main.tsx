import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";

if (Capacitor.getPlatform() === "ios") {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);


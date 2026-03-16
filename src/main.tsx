import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (typeof window !== "undefined" && (window as any).Capacitor) {
  console.log("[debug] Capacitor plugins:", (window as any).Capacitor.Plugins);
}

createRoot(document.getElementById("root")!).render(<App />);

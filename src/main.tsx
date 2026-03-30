import { createRoot } from "react-dom/client";
import "./index.css";

if (typeof document !== "undefined") {
  const storedTheme = localStorage.getItem("perf_theme");
  const themeClass = storedTheme === "light" ? "light" : "dark";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(themeClass);
}

if (import.meta.env.PROD) {
  console.log = () => undefined;
  console.info = () => undefined;
  console.debug = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
}

async function bootstrap() {
  if (import.meta.env.DEV && typeof window !== "undefined" && (window as any).Capacitor) {
    console.log("[debug] Capacitor plugins:", (window as any).Capacitor.Plugins);
  }

  const { default: App } = await import("./App.tsx");
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();

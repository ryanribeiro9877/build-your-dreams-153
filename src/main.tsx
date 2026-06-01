import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry error monitoring before anything else.
initSentry();

// Apply persisted theme as early as possible to avoid flash.
(function applyInitialTheme() {
  try {
    const saved = window.localStorage.getItem("jc-theme");
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

createRoot(document.getElementById("root")!).render(<App />);

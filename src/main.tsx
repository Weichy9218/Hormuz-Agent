// App bootstrap for the Hormuz case-room frontend.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/system.css";
import "./styles/product.css";
import "./styles/forecast.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

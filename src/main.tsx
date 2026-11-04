import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { firebaseConfig } from "./firebaseConfig";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App firebaseConfig={firebaseConfig} /></StrictMode>);

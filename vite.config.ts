import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : l'app fonctionne peu importe le nom du dépôt GitHub (https://<toi>.github.io/<depot>/)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020", sourcemap: false }
});

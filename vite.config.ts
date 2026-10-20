import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "base" doit être le nom exact du dépôt, avec la même casse.
export default defineConfig({
  base: "/Parfum-manager/",
  plugins: [react()],
});

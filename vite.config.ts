import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "base" doit être le nom exact de votre dépôt GitHub.
export default defineConfig({
  base: "/parfum-manager/",
  plugins: [react()],
});

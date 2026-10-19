import { defineConfig } from "vite";
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  preview: { host: "0.0.0.0", port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: true, rolldownOptions: { input: {
    game: fileURLToPath(new URL('./index.html', import.meta.url)),
    lab: fileURLToPath(new URL('./lab.html', import.meta.url)),
  } } },
});

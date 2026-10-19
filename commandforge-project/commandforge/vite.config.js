import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { adsenseFiles } from "./src/lib/adsenseFiles.js";

// With VITE_ADSENSE_CLIENT set, adds the two things AdSense checks before it
// approves the site: its ownership meta tag on the page, and an ads.txt file
// naming this site's publisher ID.
function adsense(client) {
  const files = adsenseFiles(client);
  return {
    name: "adsense",
    transformIndexHtml(html) {
      return files ? html.replace("</head>", `    ${files.metaTag}\n  </head>`) : html;
    },
    generateBundle() {
      if (files) this.emitFile({ type: "asset", fileName: "ads.txt", source: files.adsTxt });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), adsense(env.VITE_ADSENSE_CLIENT)],
  };
});

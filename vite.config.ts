import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import {
  canaryBranding,
  productionBranding,
} from "./src/lib/branding/branding-definitions"

const isProductionBranding = process.env.CF_PAGES_BRANCH === "main"

function htmlBrandingPlugin(isProduction: boolean): Plugin {
  const branding = isProduction ? productionBranding : canaryBranding

  return {
    name: "html-branding",
    transformIndexHtml(html) {
      if (isProduction) {
        return html
      }

      return html
        .replace("<title>Peepochat</title>", `<title>${branding.title}</title>`)
        .replace('href="/branding/icon.svg"', `href="${branding.favicon}"`)
        .replace('href="/branding/appicon.png"', `href="${branding.appIcon}"`)
        .replace('href="/manifest.webmanifest"', `href="${branding.manifest}"`)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), htmlBrandingPlugin(isProductionBranding)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __PRODUCTION_BRANDING__: JSON.stringify(isProductionBranding),
  },
  appType: "spa",
})

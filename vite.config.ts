import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import {
  brandingForVariant,
  resolveBrandingVariant,
  type BrandingVariant,
} from "./src/lib/branding"

const brandingVariant = resolveBrandingVariant(process.env.CF_PAGES_BRANCH)

function htmlBrandingPlugin(variant: BrandingVariant): Plugin {
  const branding = brandingForVariant(variant)

  return {
    name: "html-branding",
    transformIndexHtml(html) {
      if (variant === "production") {
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
  plugins: [react(), tailwindcss(), htmlBrandingPlugin(brandingVariant)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BRANDING_VARIANT__: JSON.stringify(brandingVariant),
  },
  appType: "spa",
})

export type AppBranding = {
  title: string
  favicon: string
  pingFavicon: string
  manifest: string
  appIcon: string
}

export type BrandingVariant = "production" | "canary" | "dev"

declare const __BRANDING_VARIANT__: BrandingVariant

export const productionBranding: AppBranding = {
  title: "Peepochat",
  favicon: "/branding/icon.svg",
  pingFavicon: "/branding/icon-ping.svg",
  manifest: "/manifest.webmanifest",
  appIcon: "/branding/appicon.png",
}

export const canaryBranding: AppBranding = {
  title: "Peepochat Canary",
  favicon: "/branding/icon.svg",
  pingFavicon: "/branding/icon-ping.svg",
  manifest: "/manifest-canary.webmanifest",
  appIcon: "/branding/appicon-canary.png",
}

export const devBranding: AppBranding = {
  title: "Peepochat Dev",
  favicon: "/branding/icon.svg",
  pingFavicon: "/branding/icon-ping.svg",
  manifest: "/manifest-dev.webmanifest",
  appIcon: "/branding/appicon-dev.png",
}

export function resolveBrandingVariant(
  cloudflareBranch: string | undefined
): BrandingVariant {
  if (cloudflareBranch === undefined || cloudflareBranch === "") {
    return "dev"
  }

  if (cloudflareBranch === "main") {
    return "production"
  }

  return "canary"
}

export function brandingForVariant(variant: BrandingVariant): AppBranding {
  switch (variant) {
    case "production":
      return productionBranding
    case "canary":
      return canaryBranding
    case "dev":
      return devBranding
  }
}

export const APP_BRANDING = brandingForVariant(
  typeof __BRANDING_VARIANT__ === "undefined" ? "dev" : __BRANDING_VARIANT__
)

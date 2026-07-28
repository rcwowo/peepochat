export type AppBranding = {
  title: string
  favicon: string
  pingFavicon: string
  manifest: string
  appIcon: string
}

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

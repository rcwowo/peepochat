import {
  canaryBranding,
  productionBranding,
} from "@/lib/branding/branding-definitions"

export const APP_BRANDING = __PRODUCTION_BRANDING__
  ? productionBranding
  : canaryBranding

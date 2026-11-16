import { describe, expect, test } from "bun:test"

import {
  APP_BRANDING,
  brandingForVariant,
  resolveBrandingVariant,
} from "@/lib/branding"

describe("resolveBrandingVariant", () => {
  test("maps the Cloudflare branch to a variant", () => {
    expect(resolveBrandingVariant(undefined)).toBe("dev")
    expect(resolveBrandingVariant("")).toBe("dev")
    expect(resolveBrandingVariant("main")).toBe("production")
    expect(resolveBrandingVariant("ver/1.4.0")).toBe("canary")
    expect(resolveBrandingVariant("Main")).toBe("canary")
  })
})

describe("brandingForVariant", () => {
  test("gives each variant its own title, manifest and app icon", () => {
    const variants = (["production", "canary", "dev"] as const).map(
      brandingForVariant
    )

    for (const key of ["title", "manifest", "appIcon"] as const) {
      expect(new Set(variants.map((branding) => branding[key])).size).toBe(3)
    }
  })

  test("uses the injected variant for the app branding", () => {
    expect(APP_BRANDING).toBe(brandingForVariant("dev"))
  })
})

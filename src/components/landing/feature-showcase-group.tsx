import { LayoutShowcaseSection } from "@/components/landing/layout-showcase-section"
import { NotificationsShowcaseSection } from "@/components/landing/notifications-showcase-section"
import { SearchShowcaseSection } from "@/components/landing/search-showcase-section"

export function FeatureShowcaseGroup() {
  return (
    <div className="relative overflow-hidden border-t border-white/8 bg-card/20 py-8 lg:py-16">
      <div
        className="landing-showcase-grid pointer-events-none absolute inset-0"
        aria-hidden
      />

      <LayoutShowcaseSection />
      <NotificationsShowcaseSection />
      <SearchShowcaseSection />
    </div>
  )
}

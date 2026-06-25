import { cn } from "@/lib/utils"

function isPlatformIconSrc(src: string): boolean {
  return src.startsWith("/icons/")
}

type PickerIconProps = {
  src: string
  className?: string
  rounded?: boolean
}

/**
 * Renders bundled platform SVGs with mask + currentColor so they follow the theme.
 * Remote URLs (channel avatars) use a normal image element.
 */
export function PickerIcon({
  src,
  className,
  rounded = false,
}: PickerIconProps) {
  if (isPlatformIconSrc(src)) {
    return (
      <span
        aria-hidden
        className={cn(
          "block shrink-0 bg-foreground",
          rounded ? "rounded-full" : "rounded-sm",
          className
        )}
        style={{
          maskImage: `url(${src})`,
          WebkitMaskImage: `url(${src})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
    )
  }

  return (
    <img
      src={src}
      alt=""
      className={cn(
        "shrink-0 object-cover",
        rounded ? "rounded-full" : "rounded-sm",
        className
      )}
      loading="lazy"
      decoding="async"
    />
  )
}

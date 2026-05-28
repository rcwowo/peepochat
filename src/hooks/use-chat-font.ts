import * as React from "react"

import {
  applyGoogleFontLink,
  resolveChatFontFamily,
} from "@/lib/chat-fonts"

export function useChatFontFamily(fontFamilyInput: string) {
  const resolved = React.useMemo(
    () => resolveChatFontFamily(fontFamilyInput),
    [fontFamilyInput]
  )

  React.useEffect(() => {
    applyGoogleFontLink(resolved.googleFontFamily)
  }, [resolved.googleFontFamily])

  return resolved.cssFontFamily
}

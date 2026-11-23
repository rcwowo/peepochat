import type { Modifier } from "@dnd-kit/core"

export const restrictToVerticalContainer: Modifier = ({
  activeNodeRect,
  containerNodeRect,
  transform,
}) => {
  const nextTransform = { ...transform, x: 0 }

  if (!activeNodeRect || !containerNodeRect) {
    return nextTransform
  }

  return {
    ...nextTransform,
    y: Math.min(
      Math.max(nextTransform.y, containerNodeRect.top - activeNodeRect.top),
      containerNodeRect.bottom - activeNodeRect.bottom
    ),
  }
}

export type LandingChannel = {
  displayName: string
  profileImageUrl: string
  live?: boolean
  unread?: boolean
}

export const LANDING_CHANNELS = {
  rcwOwO: {
    displayName: "rcwOwO",
    profileImageUrl: "/landing/channels/rcwowo.png",
  },
  dhinkha: {
    displayName: "Dhinkha",
    profileImageUrl: "/landing/channels/dhinkha.png",
  },
  toastercat: {
    displayName: "toastercat_",
    profileImageUrl: "/landing/channels/toastercat_.png",
    live: true,
    unread: true,
  },
  xrayc4: {
    displayName: "XRayC4",
    profileImageUrl: "/landing/channels/xrayc4.png",
  },
} as const satisfies Record<string, LandingChannel>

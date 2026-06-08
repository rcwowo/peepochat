import * as React from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { TooltipProvider } from "@/components/ui/tooltip"
import { OAuthCallbackRedirect } from "@/components/landing/oauth-callback-redirect"

const LandingPage = React.lazy(() =>
  import("@/pages/landing-page").then((module) => ({
    default: module.LandingPage,
  }))
)

const DashboardApp = React.lazy(() =>
  import("@/pages/dashboard-app").then((module) => ({
    default: module.DashboardApp,
  }))
)

function RouteFallback() {
  return <div className="min-h-svh bg-background" />
}

export function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <OAuthCallbackRedirect />
        <React.Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app/*" element={<DashboardApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App

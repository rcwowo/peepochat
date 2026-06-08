import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { TooltipProvider } from "@/components/ui/tooltip"
import { OAuthCallbackRedirect } from "@/components/landing/oauth-callback-redirect"
import { DashboardApp } from "@/pages/dashboard-app"
import { LandingPage } from "@/pages/landing-page"

export function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <OAuthCallbackRedirect />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app/*" element={<DashboardApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App

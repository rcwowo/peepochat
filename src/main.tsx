import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { PocketHandoffPage } from "@/pages/pocket-handoff-page.tsx"
import { ThemeProvider } from "@/components/shell/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { getPocketHandoff } from "@/lib/twitch/auth/pocket-handoff.ts"

const pocketHandoff = getPocketHandoff()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {pocketHandoff ? (
        <PocketHandoffPage handoff={pocketHandoff} />
      ) : (
        <>
          <App />
          <Toaster position="top-center" />
        </>
      )}
    </ThemeProvider>
  </StrictMode>
)

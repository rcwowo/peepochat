import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterEach } from "bun:test"

import packageJson from "../../package.json"

GlobalRegistrator.register({ url: "http://localhost:5173/" })

Object.assign(globalThis, {
  __APP_VERSION__: packageJson.version,
  __BRANDING_VARIANT__: "dev",
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

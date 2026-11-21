import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import { ChristmasProvider } from './christmas'
import '@fontsource-variable/manrope'
import '@fontsource-variable/bricolage-grotesque'
import './styles.css'
import { applyTheme, storedTheme } from './theme'

applyTheme(storedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ChristmasProvider>
        <App />
      </ChristmasProvider>
    </I18nProvider>
  </StrictMode>,
)

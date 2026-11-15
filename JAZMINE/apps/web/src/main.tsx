import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from './features/auth/SessionProvider';
import { App } from './App';
import { initializeTheme, ThemeProvider } from './features/theme/ThemeProvider';
import './styles.css';

initializeTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);

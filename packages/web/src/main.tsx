import App from '@/App.tsx';
import { ThemeProvider } from '@/components/theme-provider.tsx';

import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Start the MSW pseudo-backend in dev before the app makes any requests.
async function enableMocking() {
  if (!import.meta.env.DEV) return;
  const { worker } = await import('./mocks/browser.ts');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

async function bootstrap() {
  await enableMocking();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark">
        <App />
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();

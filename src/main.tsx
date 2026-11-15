import { createRoot } from 'react-dom/client';
import ConfigError from './ConfigError';
import { missingEnv } from './lib/config';
import './index.css';

// Firebase throws at import time when its config is empty, so the app is only loaded
// (dynamically) once the required variables are present. Otherwise show a readable message.
async function start() {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  const missing = missingEnv();
  if (missing.length) {
    root.render(<ConfigError missing={missing} />);
    return;
  }
  try {
    const { default: Boot } = await import('./boot');
    root.render(<Boot />);
  } catch (e) {
    root.render(<ConfigError error={e instanceof Error ? e.message : String(e)} />);
  }
}

void start();

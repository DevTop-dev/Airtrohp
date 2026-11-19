import { useEffect, useState } from 'react';
import { API_URL } from './config';

export interface AiModel {
  id: string;
  name: string;
  model: string;
}

const KEY = 'airtrohp.provider.v1';
export const AUTO: AiModel = { id: 'auto', name: 'Auto', model: 'Airtrohp picks the best available AI' };

/** The AI the user picked ("auto" = let Airtrohp choose). Stored in the browser. */
export function getSelectedProvider(): string {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setSelectedProvider(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage disabled: the choice lasts until reload */
  }
}

let cache: AiModel[] | null = null;

/** Lists every AI connected to the server, fetched once per page load. */
export function useModels(): AiModel[] {
  const [models, setModels] = useState<AiModel[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    fetch(`${API_URL}/api/models`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { models?: AiModel[] }) => {
        cache = Array.isArray(d.models) ? d.models : [];
        if (alive) setModels(cache);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return models;
}

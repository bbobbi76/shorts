import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { repository } from '../../data/repository';
import { type Category, type Skill, type ServiceError } from '../../domain/model';
import { ErrorBox, Loading } from '../../shared/ui';
import { toError } from '../../shared/format';
import { useApp } from './context';

type Metadata = { categories: Category[]; skills: Skill[]; ready: boolean; loading: boolean; error: ServiceError | null; retry: () => void };
const Context = createContext<Metadata>(null!);
export function MetadataProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { authEpoch, handleError } = useApp();
  const [data, setData] = useState<{ categories: Category[]; skills: Skill[] }>({ categories: [], skills: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true; setLoading(true); setError(null); setLoaded(false);
    Promise.all([repository.categories(), repository.skills()]).then(([categories, skills]) => {
      if (active) { setData({ categories, skills }); setLoaded(true); }
    }).catch(reason => { if (active) { setError(toError(reason)); handleError(reason); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, authEpoch, handleError, attempt]);
  return <Context.Provider value={{ ...data, ready: enabled && loaded && !loading && !error, loading, error, retry: () => setAttempt(value => value + 1) }}>{children}</Context.Provider>;
}
export function useMetadata() { return useContext(Context); }
export function MetadataStatus() {
  const meta = useMetadata();
  return meta.loading ? <Loading/> : <ErrorBox error={meta.error} retry={meta.retry}/>;
}

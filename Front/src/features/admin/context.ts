import { createContext, useContext } from 'react';
export type AdminContext = { handleError: (error: unknown) => void; notify: (text: string) => void; setDirty: (dirty: boolean) => void; authEpoch: number };
export const Context = createContext<AdminContext>(null!);
export const useApp = () => useContext(Context);

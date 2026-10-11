import { useRef } from 'react';
import { mutationIdentity } from '../services/http';

export function useActionIdentity() { const identities = useRef(new Map<string, string>()); return (action: string, input: unknown) => { const signature = `${action}:${JSON.stringify(input)}`; const existing = identities.current.get(signature); if (existing) return existing; const identity = mutationIdentity(); identities.current.set(signature, identity); return identity; }; }

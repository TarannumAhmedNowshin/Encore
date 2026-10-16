import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * App-level store for long-running browser-orchestrated jobs (discovery, departments, people).
 * Lives outside page components so switching stages never pauses or forgets a run.
 */
export type Job = { key: string; analysisId: string; label: string; done: number; total: number };

const state = new Map<string, unknown>();
let jobs: Job[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function getRun<T>(key: string, initial: T): T {
  return (state.has(key) ? state.get(key) : initial) as T;
}
export function setRun<T>(key: string, v: T | ((prev: T) => T), initial: T) {
  const prev = getRun(key, initial);
  state.set(key, typeof v === "function" ? (v as (p: T) => T)(prev) : v);
  emit();
}

/** Like useState, but the value is shared app-wide and survives unmounting. */
export function useRunState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const initialRef = useRef(initial);
  const value = useSyncExternalStore(subscribe, () => getRun(key, initialRef.current), () => initialRef.current);
  const set = useCallback((v: T | ((prev: T) => T)) => setRun(key, v, initialRef.current), [key]);
  return [value, set];
}

export function setJob(job: Job) { jobs = [...jobs.filter((j) => j.key !== job.key), job]; emit(); }
export function clearJob(key: string) { jobs = jobs.filter((j) => j.key !== key); emit(); }
const noJobs: Job[] = [];
export const useJobs = () => useSyncExternalStore(subscribe, () => jobs, () => noJobs);

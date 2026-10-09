import { LoaderCircle } from 'lucide-react';
export function Skeleton() { return <div aria-hidden="true" className="space-y-4"><div className="h-6 w-2/3 rounded bg-slate-100"/><div className="h-24 rounded-lg bg-slate-100"/><div className="h-6 w-1/2 rounded bg-slate-100"/></div>; }

export function PageHeading({ title, detail }: { title: string; detail: string }) { return <div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">Your preparation workspace</p><h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div>; }
export function Loading() { return <p role="status" className="flex items-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin"/>Loading your records…</p>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div role="alert" className="mb-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{message}{retry && <button onClick={retry} className="ml-3 font-semibold underline">Try again</button>}</div>; }
export function Empty({ message }: { message: string }) { return <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm leading-6 text-slate-500">{message}</p>; }

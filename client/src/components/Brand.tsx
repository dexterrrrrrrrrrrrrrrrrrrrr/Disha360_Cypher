import { Layers } from 'lucide-react';
export function Brand({ dark = false }: { dark?: boolean }) {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><Layers size={22}/></span><div><div className={`text-lg font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Cypher<span className={`ml-1.5 text-xs font-medium ${dark ? 'text-indigo-300' : 'text-brand'}`}>4.0</span></div><div className={`text-[10px] font-semibold uppercase tracking-[.17em] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>MyStartupWave</div></div></div>;
}

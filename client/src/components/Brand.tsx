import { Layers } from 'lucide-react';
export function Brand({ dark = false }: { dark?: boolean }) {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><Layers size={22}/></span><div><div className={`text-lg font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Disha360</div><div className={`text-[10px] font-semibold uppercase tracking-[.12em] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Placement training</div></div></div>;
}

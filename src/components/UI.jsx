import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

export const Toast = ({ message, onClose, t }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-bounce-in w-full max-w-md px-6">
      <div className={`bg-slate-900 border-4 border-slate-900 shadow-[10px_10px_0_#2563eb] p-6 rounded-[2rem] flex items-center gap-5 relative overflow-hidden`}>
        <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
        <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center shrink-0">
          <AlertCircle className="text-blue-600" size={28} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-1">{t('notification')}</p>
          <p className="text-white font-black text-sm md:text-base leading-tight uppercase italic">{message}</p>
        </div>
        <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

export const SectionHeader = ({ title, sub }) => (
  <div className="mb-4 md:mb-6 border-l-4 border-blue-600 pl-3 md:pl-4">
    <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase">{title}</h2>
    <p className="text-slate-500 font-mono text-[8px] md:text-[10px] mt-0.5 tracking-widest font-bold uppercase">{sub}</p>
  </div>
);

export const LanguageSwitcher = ({ lang, setLang }) => (
  <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 shrink-0">
    {['ru', 'kk', 'en'].map(l => (
      <button
        key={l}
        onClick={() => setLang(l)}
        className={`px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-[10px] font-black uppercase rounded-xl transition-all ${lang === l ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
      >
        {l}
      </button>
    ))}
  </div>
);

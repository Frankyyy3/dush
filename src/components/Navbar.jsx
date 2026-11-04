import React from 'react';
import { LanguageSwitcher } from './UI';

export const Navbar = ({ user, activeView, setActiveView, t, lang, setLang }) => {
  return (
    <nav className="h-20 md:h-24 border-b-4 border-slate-900 flex items-center justify-between px-6 md:px-12 lg:px-20 bg-white sticky top-0 z-50 rounded-b-[2rem] md:rounded-b-[3rem] shadow-sm">
      <div className="flex items-center gap-6 md:gap-16">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveView('dashboard')}>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center -rotate-6 group-hover:rotate-0 transition-transform shadow-sm overflow-hidden p-1">
            <img src="/university_logo.png" alt="University Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-slate-900 font-black italic text-xl md:text-3xl tracking-tighter">{t('app_name')}</span>
        </div>
        <div className="hidden md:flex gap-10 text-sm font-black text-slate-400 uppercase tracking-widest">
          {user.role === 'admin' ? (
            <button className={`hover:text-blue-600 transition-colors ${activeView === 'admin' ? 'text-blue-600 underline decoration-4 underline-offset-8' : ''}`} onClick={() => setActiveView('admin')}>{t('admin_panel')}</button>
          ) : (
            <>
              <button className={`hover:text-blue-600 transition-colors ${activeView === 'dashboard' ? 'text-blue-600 underline decoration-4 underline-offset-8' : ''}`} onClick={() => setActiveView('dashboard')}>{t('scheduler')}</button>
              <button className={`hover:text-blue-600 transition-colors ${activeView === 'laundry' ? 'text-blue-600 underline decoration-4 underline-offset-8' : ''}`} onClick={() => setActiveView('laundry')}>{t('laundry')}</button>
              <button className={`hover:text-blue-600 transition-colors ${activeView === 'history' ? 'text-blue-600 underline decoration-4 underline-offset-8' : ''}`} onClick={() => setActiveView('history')}>{t('logs')}</button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 md:gap-12">
        <LanguageSwitcher lang={lang} setLang={setLang} />
        <button onClick={() => { localStorage.removeItem('user'); window.location.reload(); }} className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline decoration-2 underline-offset-4">LOGOUT_</button>
      </div>
    </nav>
  );
};

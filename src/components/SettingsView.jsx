import React from 'react';
import { Zap, BellRing, Smartphone, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { SectionHeader } from './UI';

export const SettingsView = ({ t, notify, pushStatus, onEnablePush }) => {
  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
    /iphone|ipad|ipod/.test(navigator.platform.toLowerCase()) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  return (
    <div className="p-4 md:p-6 lg:p-10 space-y-8 animate-fade-in bg-white font-mono">
      <SectionHeader title={t('settings')} sub={t('settings_sub')} />

      {/* Уведомления */}
      <div className="bg-slate-50 border-4 border-slate-900 p-6 md:p-8 rounded-[2rem] shadow-inner space-y-6">
        <h3 className="text-xl font-black text-slate-900 uppercase flex items-center gap-3">
          <BellRing className="text-blue-600" />
          {t('push_notifications')}
        </h3>
        
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-200">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-bold text-slate-900 text-sm">{t('notification_status')}</p>
              <p className={`font-black text-xs uppercase tracking-widest mt-1 ${pushStatus === 'granted' ? 'text-green-600' : pushStatus === 'denied' ? 'text-red-600' : 'text-yellow-600'}`}>
                {pushStatus === 'granted' ? t('push_granted') : pushStatus === 'denied' ? t('push_denied') : pushStatus === 'unsupported' ? t('push_unsupported') : t('push_not_requested')}
              </p>
            </div>
            
            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && pushStatus !== 'denied' && (
              <button
                onClick={onEnablePush}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-md"
              >
                {t('enable_push')}
              </button>
            )}
            {pushStatus === 'granted' && (
              <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-4 py-2 rounded-xl border border-green-200">
                <CheckCircle2 size={16} /> {t('works_great')}
              </div>
            )}
          </div>

          {pushStatus === 'denied' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-xs font-bold text-red-900 leading-relaxed">
                {t('push_blocked_warning')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Инструкция для iOS */}
      {isIOS && (
        <div className="bg-blue-50 border-4 border-slate-900 p-6 md:p-8 rounded-[2rem] shadow-[8px_8px_0_#2563eb] space-y-4">
          <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <span className="bg-white p-2 border-2 border-slate-900 rounded-xl"><Smartphone size={24} className="text-blue-600" /></span>
            {t('how_to_ios')}
          </h3>
          <p className="text-slate-700 font-bold text-sm leading-relaxed max-w-2xl">
            {t('ios_policy')}
          </p>
          <div className="space-y-2 mt-4 bg-white/60 p-4 rounded-xl border-2 border-blue-200">
            <p className="text-slate-900 font-black text-xs md:text-sm">{t('ios_step1')}</p>
            <p className="text-slate-900 font-black text-xs md:text-sm">{t('ios_step2')}</p>
            <p className="text-slate-900 font-black text-xs md:text-sm">{t('ios_step3')}</p>
          </div>
          {isStandalone && (
            <div className="mt-4 inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-xl font-bold text-xs uppercase border border-green-300">
              <CheckCircle2 size={16} /> {t('ios_installed')}
            </div>
          )}
        </div>
      )}

      {/* Дополнительная инфа */}
      <div className="bg-slate-50 border-4 border-slate-900 p-6 rounded-[2rem] shadow-inner text-center">
        <Zap className="mx-auto text-yellow-500 mb-3" size={32} />
        <p className="font-bold text-slate-600 text-sm max-w-md mx-auto">
          {t('push_info')}
        </p>
      </div>
    </div>
  );
};

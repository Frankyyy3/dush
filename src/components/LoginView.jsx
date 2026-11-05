import { useState } from 'react';
import { LanguageSwitcher } from './UI';

export const LoginView = ({ onLogin, lang, setLang, t, notify, API_URL }) => {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!studentId || !password) return notify("Заполните все поля / Fill all fields");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, password })
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(data);
      } else {
        const err = await res.json();
        notify(err.detail);
      }
    } catch (e) {
      console.error(e);
      notify("CONNECTION_LOST // SERVER_ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex font-mono selection:bg-blue-600 selection:text-white overflow-x-hidden">
      <div className="hidden lg:flex w-1/2 p-24 flex-col justify-between bg-slate-50 border-r-4 border-slate-900 relative overflow-hidden rounded-r-[4rem]">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <img src="/university_logo.png" alt="" className="w-[400px] h-[400px] object-contain" />
        </div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center -rotate-2 shadow-sm overflow-hidden p-1">
              <img src="/university_logo.png" alt="University Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-2xl font-black text-slate-900 tracking-tighter italic">{t('app_name')}</span>
          </div>
        </div>
        <div className="space-y-4 relative z-10">
          <h1 className="text-6xl font-black text-slate-900 leading-none tracking-tighter uppercase">
            SHAKARIM <br /> <span className="text-blue-600">SHOWER</span> <br /> PORTAL
          </h1>
          <p className="text-slate-600 max-w-xs font-bold leading-relaxed border-l-4 border-blue-600 pl-4 uppercase rounded-sm text-xs">
            {t('official_system')} <br />
            {t('university_name')}
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 lg:p-24 bg-white relative">
        <div className="w-full max-w-md space-y-8 md:space-y-12 relative z-10">
          <div className="lg:hidden flex items-center gap-2 mb-8 pb-8 border-b-2 border-slate-100">
            <div className="w-10 h-10 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center -rotate-2 shadow-sm overflow-hidden p-1">
              <img src="/university_logo.png" alt="University Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-lg font-black text-slate-900 tracking-tighter italic">{t('app_name')}</span>
          </div>

          <div>
            <div className="flex justify-end mb-4 lg:mb-0 lg:absolute lg:top-0 lg:right-0">
              <LanguageSwitcher lang={lang} setLang={setLang} />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-2 tracking-tighter underline decoration-blue-600 decoration-8 underline-offset-8 uppercase">
              {t('login_title')}
            </h2>
            <p className="text-slate-400 uppercase text-[9px] md:text-[10px] font-bold tracking-[0.3em] mt-6 italic">{t('access_portal')}</p>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-slate-400 mb-1 tracking-widest uppercase">
                <span>{t('student_id')}</span>
                <span className="text-blue-600">{t('required')}</span>
              </div>
              <input value={studentId} onChange={e => setStudentId(e.target.value)} type="text" placeholder="username" className="w-full bg-slate-50 border-4 border-slate-900 p-5 md:p-7 text-slate-900 focus:bg-white focus:ring-8 focus:ring-blue-600/10 outline-none transition-all placeholder:text-slate-300 font-black text-lg md:text-xl rounded-[2rem]" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] md:text-[10px] font-bold text-slate-400 mb-1 tracking-widest uppercase">
                <span>{t('secure_key')}</span>
                <span className="text-blue-600">{t('encrypted')}</span>
              </div>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" className="w-full bg-slate-50 border-4 border-slate-900 p-5 md:p-7 text-slate-900 focus:bg-white focus:ring-8 focus:ring-blue-600/10 outline-none transition-all placeholder:text-slate-300 font-black text-lg md:text-xl tracking-[0.4em] rounded-[2rem]" />
            </div>
            <button disabled={loading} onClick={handleLogin} className="w-full bg-blue-600 text-white font-black py-6 md:py-8 hover:bg-slate-900 transition-all active:scale-[0.98] uppercase tracking-widest text-base md:text-lg shadow-[8px_8px_0_rgba(0,0,0,1)] hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 mt-4 rounded-[2rem] disabled:opacity-50">
              {loading ? t('loading') : t('start_session')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

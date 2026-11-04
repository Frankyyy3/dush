import React, { useState, useEffect, useRef } from 'react';
import { ShowerHead, WashingMachine, History, Settings } from 'lucide-react';
import { Toast } from './components/UI';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { AdminPanelView } from './components/AdminPanelView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { translations } from './translations';
import { API_URL } from './constants';
import { registerSW, usePWAInstall } from './pwa';

registerSW();

export default function App() {
  const [lang, setLang] = useState('ru');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')) || null);
  const [activeView, setActiveView] = useState('dashboard');
  const [bookings, setBookings] = useState([]);
  const [notification, setNotification] = useState(null);
  const { canInstall, triggerInstall, isInstalled, isIOS } = usePWAInstall();
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [pushStatus, setPushStatus] = useState(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const pushSubscribeInFlight = useRef(false);

  const t = (key) => translations[lang][key] || key;

  const showNotification = (msg) => setNotification(msg);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPushNotifications = async (userData, { forceRefresh = false } = {}) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    if (pushSubscribeInFlight.current) return;
    pushSubscribeInFlight.current = true;

    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission);
      if (permission !== 'granted') return;

      const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicVapidKey) {
        console.error('[Push] VITE_VAPID_PUBLIC_KEY is missing');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      // На Android принудительный unsubscribe при каждом входе ломает FCM-подписку
      if (forceRefresh && subscription) {
        try {
          await subscription.unsubscribe();
        } catch (e) {
          console.error('[Push] Unsubscribe failed:', e);
        }
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        });
      }

      const subJson = subscription.toJSON();
      const res = await fetch(`${API_URL}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userData.token}`,
        },
        body: JSON.stringify(subJson),
      });
      if (!res.ok) {
        console.error('[Push] Subscribe API failed:', await res.text());
      }
    } catch (e) {
      console.error('Push subscription failed:', e);
    } finally {
      pushSubscribeInFlight.current = false;
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      if (user.role === 'admin') setActiveView('admin');
      else subscribeToPushNotifications(user);
    }
  }, [user]);

  const fetchBookings = async () => {
    if (!user || user.role === 'admin') return;
    try {
      const res = await fetch(`${API_URL}/bookings/${user.id}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBookings(Array.isArray(data) ? data : []);
      } else {
        if (res.status === 401) {
          localStorage.removeItem('user');
          window.location.reload();
          return;
        }
        setBookings([]);
      }
    } catch (e) { 
      console.error(e); 
      setBookings([]);
    }
  };

  const handleCancel = async (bookingId) => {
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}?user_id=${user.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (res.ok) {
        showNotification(t('cancel_success'));
        fetchBookings();
      } else {
        const error = await res.json();
        showNotification(error.detail || t('error_cancel'));
      }
    } catch (e) {
      showNotification(t('error_cancel'));
    }
  };

  useEffect(() => { fetchBookings(); }, [user]);

  const renderPwaBanner = () => {
    if (!showInstallBanner || isInstalled || (!canInstall && !isIOS)) return null;
    return (
      <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-full md:max-w-md z-50 animate-slide-up">
        <div className="bg-slate-900 border-4 border-slate-900 shadow-[8px_8px_0_#2563eb] rounded-[2rem] p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden p-1">
            <img src="/university_logo.png" alt="" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-sm uppercase tracking-tight">{t('install_app')}</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              {isIOS ? t('install_ios_hint') : t('install_android_hint')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!isIOS && (
              <button
                onClick={triggerInstall}
                className="bg-blue-600 text-white font-black text-xs uppercase px-4 py-2.5 rounded-xl hover:bg-blue-500 transition-colors"
              >
                {t('yes')}
              </button>
            )}
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-slate-400 font-black text-xs uppercase px-3 py-2.5 rounded-xl hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <>
        {notification && <Toast message={notification} t={t} onClose={() => setNotification(null)} />}
        <LoginView onLogin={handleLogin} lang={lang} setLang={setLang} t={t} notify={showNotification} API_URL={API_URL} />
        {renderPwaBanner()}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-mono selection:bg-blue-600 selection:text-white overflow-x-hidden pb-24 md:pb-0">
      {notification && <Toast message={notification} t={t} onClose={() => setNotification(null)} />}

      <Navbar user={user} activeView={activeView} setActiveView={setActiveView} t={t} lang={lang} setLang={setLang} />

      <main className="max-w-7xl mx-auto">
        {activeView === 'dashboard' && <DashboardView user={user} bookings={bookings} onBook={() => { setActiveView('history'); fetchBookings(); }} setActiveView={setActiveView} t={t} notify={showNotification} pushStatus={pushStatus} onEnablePush={() => subscribeToPushNotifications(user)} type="shower" />}
        {activeView === 'laundry' && <DashboardView user={user} bookings={bookings} onBook={() => { setActiveView('history'); fetchBookings(); }} setActiveView={setActiveView} t={t} notify={showNotification} pushStatus={pushStatus} onEnablePush={() => subscribeToPushNotifications(user)} type="laundry" />}
        {activeView === 'history' && <HistoryView bookings={bookings} onRefresh={fetchBookings} onCancel={handleCancel} t={t} notify={showNotification} user={user} />}
        {activeView === 'settings' && <SettingsView t={t} notify={showNotification} pushStatus={pushStatus} onEnablePush={() => subscribeToPushNotifications(user, { forceRefresh: true })} />}
        {activeView === 'admin' && <AdminPanelView t={t} onRefresh={() => {}} notify={showNotification} user={user} />}
      </main>

      {/* PWA Install Banner */}
      {renderPwaBanner()}

      {/* Floating Mobile Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none">
        <div className="max-w-md mx-auto bg-white border-4 border-slate-900 shadow-[4px_4px_0_rgba(0,0,0,1)] rounded-[2rem] p-2 flex justify-around items-center pointer-events-auto">
          {user.role === 'admin' ? (
              <button 
                onClick={() => setActiveView('admin')}
                className={`flex flex-col items-center gap-1 py-2 px-4 font-black text-[9px] uppercase tracking-widest transition-all rounded-2xl ${activeView === 'admin' ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Settings size={20} strokeWidth={2.5} />
                <span>{t('admin_panel')}</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={() => setActiveView('dashboard')}
                  className={`flex flex-col items-center gap-1 py-2 px-5 font-black text-[9px] uppercase tracking-widest transition-all rounded-2xl ${activeView === 'dashboard' ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <ShowerHead size={20} strokeWidth={2.5} />
                  <span>{t('scheduler')}</span>
                </button>
                <button 
                  onClick={() => setActiveView('laundry')}
                  className={`flex flex-col items-center gap-1 py-2 px-5 font-black text-[9px] uppercase tracking-widest transition-all rounded-2xl ${activeView === 'laundry' ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <WashingMachine size={20} strokeWidth={2.5} />
                  <span>{t('laundry')}</span>
                </button>
                <button 
                  onClick={() => setActiveView('history')}
                  className={`flex flex-col items-center gap-1 py-2 px-5 font-black text-[9px] uppercase tracking-widest transition-all rounded-2xl ${activeView === 'history' ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <History size={20} strokeWidth={2.5} />
                  <span>{t('logs')}</span>
                </button>
                <button 
                  onClick={() => setActiveView('settings')}
                  className={`flex flex-col items-center gap-1 py-2 px-5 font-black text-[9px] uppercase tracking-widest transition-all rounded-2xl ${activeView === 'settings' ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Settings size={20} strokeWidth={2.5} />
                  <span>{t('settings')}</span>
                </button>
              </>
            )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t-4 border-slate-900 mt-12 p-6 md:p-8 lg:p-10 rounded-t-[2rem] md:rounded-t-[3rem]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center -rotate-6 p-1">
                <img src="/university_logo.png" alt="University Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-slate-900 font-black italic text-2xl tracking-tighter">{t('app_name')}</span>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase leading-relaxed tracking-widest">{t('footer_text')}</p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Platform</h4>
              <ul className="space-y-2 text-xs font-black text-slate-900 uppercase italic">
                <li className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveView('dashboard')}>{t('scheduler')}</li>
                <li className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveView('history')}>{t('logs')}</li>
                <li className="cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setActiveView('settings')}>{t('settings')}</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Support</h4>
              <ul className="space-y-2 text-xs font-black text-slate-900 uppercase italic">
                <li className="text-blue-600 underline decoration-2 underline-offset-4">Кабинет 606</li>
                <li className="text-slate-500">Отдел разработки программного обеспечения</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t-2 border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">© 2026 SHAKARIM UNIVERSITY. ALL RIGHTS RESERVED.</p>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-200">
            <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">{user.role === 'admin' ? 'ADMIN' : 'USER'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

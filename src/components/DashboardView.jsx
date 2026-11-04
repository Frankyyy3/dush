import React, { useState, useEffect } from 'react';
import { Zap, History, ChevronRight, CornerDownRight, Plus, Check, Wrench, AlertTriangle, BellRing } from 'lucide-react';
import { SectionHeader } from './UI';
import { dates, timeSlots, dorm, API_URL } from '../constants';

export const DashboardView = ({ onBook, bookings, setActiveView, t, user, notify, pushStatus, onEnablePush, type = "shower" }) => {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return dates.find(d => d.full === today)?.full || dates.find(d => !d.isPast)?.full || dates[0].full;
  });
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedBooth, setSelectedBooth] = useState(null);
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [boothCount, setBoothCount] = useState(4);
  const [holidayBlock, setHolidayBlock] = useState(null);
  const [localTimeSlots, setLocalTimeSlots] = useState(timeSlots);

  useEffect(() => {
    fetchOccupied();
  }, [selectedDate]);

  const fetchOccupied = async () => {
    try {
      const res = await fetch(`${API_URL}/occupied-slots?date=${selectedDate}&dorm_name=${user.dorm_name}&type=${type}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (data && data.holiday) {
        setHolidayBlock(data);
        setOccupiedSlots([]);
      } else {
        setHolidayBlock(null);
        setOccupiedSlots(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
      setHolidayBlock(null);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/dorm-config?dorm_name=${encodeURIComponent(user.dorm_name)}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      setBoothCount(type === 'shower' ? data.shower_count : data.laundry_count);

      // Генерируем слоты времени динамически на основе настроек общежития
      if (data.start_time && data.end_time && data.slot_duration) {
        const slots = [];
        try {
          let curr = new Date(`2026-01-01T${data.start_time}:00`);
          const end = new Date(`2026-01-01T${data.end_time}:00`);
          while (curr.getTime() + data.slot_duration * 60000 <= end.getTime()) {
            const h = String(curr.getHours()).padStart(2, '0');
            const m = String(curr.getMinutes()).padStart(2, '0');
            slots.push(`${h}:${m}`);
            curr = new Date(curr.getTime() + data.slot_duration * 60000);
          }
          setLocalTimeSlots(slots);
        } catch (e) {
          setLocalTimeSlots(timeSlots);
        }
      } else {
        setLocalTimeSlots(timeSlots);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchConfig(); }, [user.dorm_name, type]);

  const isTimeSlotPast = (time) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (selectedDate !== todayStr) return false;

    const [h, m] = time.split(':').map(Number);
    const slotTime = new Date();
    slotTime.setHours(h, m, 0, 0);
    return slotTime < today;
  };

  const handleBook = async () => {
    setLoading(true);
    try {
      const currentHour = new Date().getHours();
      if (currentHour < 7 || currentHour >= 21) {
        notify("Запись доступна с 07:00 до 21:00");
        setLoading(false);
        return;
      }

      const dateStr = selectedDate;
      const res = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ date: dateStr, time: selectedTime, booth: selectedBooth, user_id: user.id, type: type })
      });
      const resData = await res.json();
      if (res.ok) {
        onBook();
      } else {
        if (resData.detail && (resData.detail.includes("User already has a booking") || resData.detail.includes("уже есть запись"))) {
          notify(t('error_duplicate'));
        } else if (resData.detail && resData.detail.includes("Запись доступна только")) {
          notify(resData.detail);
        } else {
          notify(t('error_booth'));
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
    /iphone|ipad|ipod/.test(navigator.platform.toLowerCase()) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  return (
    <div className="p-4 md:p-6 lg:p-10 space-y-8 md:space-y-12 animate-fade-in bg-white font-mono">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="md:col-span-2 bg-blue-600 p-6 md:p-8 text-white flex flex-col justify-between min-h-[160px] md:min-h-[200px] relative overflow-hidden group rounded-[2rem] shadow-lg shadow-blue-100">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={120} className="md:w-[140px] md:h-[140px]" /></div>
          <div className="relative z-10">
            <p className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.4em] mb-2 opacity-60">{t('dorm_info')}</p>
            <h2 className="text-2xl md:text-4xl font-black italic tracking-tighter">{user.dorm_name || dorm.name}</h2>
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-white animate-pulse rounded-full"></div>
              <span className="text-base md:text-lg font-black uppercase tracking-widest">{t('room_label')} {user.room}</span>
            </div>
            <p className="text-sm md:text-base font-black uppercase tracking-tight">{user.fullname}</p>
          </div>
        </div>

        <div className="bg-slate-900 p-6 md:p-8 flex flex-col justify-between cursor-pointer group min-h-[140px] md:min-h-0 rounded-[2rem] shadow-lg shadow-slate-100" onClick={() => setActiveView('history')}>
          <div className="flex justify-between items-start">
            <p className="text-slate-500 text-[8px] md:text-[9px] font-black uppercase tracking-widest">{t('active_passes')}</p>
            <History className="text-blue-600 w-5 h-5 group-hover:rotate-12 transition-transform" />
          </div>
          <div className="flex justify-between items-end">
            <span className="text-4xl md:text-6xl font-black text-white">{bookings.length}</span>
            <div className="bg-blue-600 p-1.5 rounded-lg"><ChevronRight className="text-white w-4 h-4" /></div>
          </div>
        </div>
      </div>

      {pushStatus && pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
        <div className="bg-amber-50 border-4 border-slate-900 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-[4px_4px_0_#0f172a]">
          <img src="/university_logo.png" alt="" className="w-12 h-12 rounded-xl border-2 border-slate-200 bg-white object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <BellRing size={18} className="text-amber-600" />
              {t('enable_push')}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-1">{t('push_info')}</p>
          </div>
          {pushStatus !== 'denied' && (
            <button
              type="button"
              onClick={onEnablePush}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-3 rounded-xl text-xs uppercase tracking-widest"
            >
              {t('enable_push')}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-8 space-y-10 md:space-y-16">
          <section>
            <SectionHeader title={t('calendar_selection')} sub="MON-FRI SCHEDULE" />
            <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-2xl mb-6 flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Запись открывается в 07:00 и закрывается в 21:00</p>
            </div>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-3 md:gap-4">
              {dates.map(d => (
                <button
                  key={d.full}
                  disabled={d.isPast}
                  onClick={() => { setSelectedDate(d.full); setSelectedTime(null); setSelectedBooth(null); }}
                  className={`p-2 sm:p-3 md:p-6 border-2 sm:border-4 font-black transition-all text-center relative rounded-2xl ${d.isPast ? 'opacity-20 cursor-not-allowed grayscale' : selectedDate === d.full ? 'bg-blue-600 border-blue-600 text-white -translate-y-1 shadow-lg shadow-blue-200' : 'bg-white border-slate-900 text-slate-900 hover:bg-slate-50 hover:border-blue-400'}`}
                >
                  <p className="text-[7px] sm:text-[9px] uppercase tracking-widest mb-1 opacity-50">{t(d.d)}</p>
                  <p className="text-sm sm:text-lg md:text-2xl font-black">{d.n}</p>
                  {d.isToday && !d.isPast && <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-white rounded-full shadow-sm"></div>}
                </button>
              ))}
            </div>
          </section>
          {holidayBlock ? (
            <div className="bg-red-50 border-4 border-slate-900 shadow-[6px_6px_0_#000] p-8 md:p-12 rounded-[2.5rem] text-center my-8 animate-fade-in lg:col-span-8">
              <div className="w-16 h-16 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-red-600 border-2 border-slate-900 shadow-md">
                <AlertTriangle size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4 italic">Внимание! Санитарный день / Выходной</h3>
              <p className="text-xs font-bold text-red-900 bg-white/80 py-3 px-6 rounded-2xl max-w-lg mx-auto uppercase tracking-wide border-2 border-red-200 shadow-sm leading-relaxed">
                Причина: {holidayBlock.reason}
              </p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-6">Пожалуйста, выберите другую дату в расписании</p>
            </div>
          ) : (
            <section>
              <SectionHeader title={t('time_allocation')} sub={t('session_duration')} />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-3">
                {localTimeSlots.map(time => {
                  const isPast = isTimeSlotPast(time);
                  const isSlotDisabled = occupiedSlots.some(s => s.time === time && s.disabled);
                  const disabledReason = occupiedSlots.find(s => s.time === time && s.disabled)?.reason || 'Блокировка';
                  return (
                    <button
                      key={time}
                      disabled={isPast || isSlotDisabled}
                      onClick={() => { setSelectedTime(time); setSelectedBooth(null); }}
                      className={`py-3 md:py-4 font-black transition-all border-2 text-[10px] md:text-sm rounded-xl relative
                        ${isPast ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400 line-through' : ''}
                        ${isSlotDisabled ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed' : ''}
                        ${selectedTime === time && !isPast && !isSlotDisabled ? 'bg-slate-900 border-slate-900 text-white shadow-md' : ''}
                        ${selectedTime !== time && !isPast && !isSlotDisabled ? 'bg-white border-slate-200 text-slate-400 hover:border-slate-900 hover:text-slate-900' : ''}
                      `}
                      title={isSlotDisabled ? disabledReason : undefined}
                    >
                      {time}
                      {isSlotDisabled && <span className="absolute top-1 right-1 text-[7px] font-bold text-orange-500 uppercase">🔒</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
        <div className="lg:col-span-4 space-y-8">
          {!holidayBlock && (
            <div className="bg-slate-50 border-4 border-slate-900 p-6 md:p-8 relative rounded-[3rem] shadow-inner">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6 md:mb-8 italic flex items-center gap-2"><CornerDownRight size={20} className="text-blue-600" /> {type === 'shower' ? t('unit_list') : t('laundry_list')}</h3>
              <div className="space-y-2.5 md:space-y-3">
                {Array.from({ length: boothCount }, (_, i) => i + 1).map(b => {
                  const isSelected = selectedBooth === b;
                  const occupiedSlot = occupiedSlots.find(s => s.time === selectedTime && s.booth === b);
                  const isOccupied = !!occupiedSlot && !occupiedSlot.maintenance;
                  const isMaintenance = occupiedSlots.some(s => s.booth === b && s.maintenance);
                  const maintenanceReason = occupiedSlots.find(s => s.booth === b && s.maintenance)?.reason;
                  const isDisabled = isOccupied || isMaintenance || !selectedTime;
                  return (
                    <button
                      key={b}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setSelectedBooth(b)}
                      title={isMaintenance ? maintenanceReason || 'На ремонте' : undefined}
                      className={`w-full flex justify-between items-center p-3 md:p-4 font-black transition-all border-2 rounded-xl
                      ${!selectedTime ? 'opacity-30 cursor-not-allowed' : ''}
                      ${isMaintenance ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed' : ''}
                      ${isOccupied && !isMaintenance ? 'bg-slate-200 text-slate-400 border-slate-200 italic line-through' : ''}
                      ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-md' : ''}
                      ${!isDisabled && !isSelected ? 'bg-white border-slate-900 text-slate-900 hover:bg-blue-50' : ''}
                    `}
                    >
                      <span className="text-[10px] md:text-xs tracking-widest uppercase">{type === 'shower' ? t('booth') : t('washing_machine')} 0{b}</span>
                      {isMaintenance
                        ? <span className="flex items-center gap-1 text-[9px] text-orange-500"><Wrench size={12} /> Ремонт</span>
                        : isOccupied
                          ? <span className="text-[9px]">{t('busy')}</span>
                          : isSelected
                            ? <Check size={16} strokeWidth={4} />
                            : <Plus size={16} />}
                    </button>
                  );
                })}
              </div>
              {selectedBooth && (
                <div className="mt-8 md:mt-12">
                  <button disabled={loading} onClick={handleBook} className="w-full bg-slate-900 text-white font-black py-5 md:py-7 hover:bg-blue-600 transition-all flex items-center justify-center gap-3 uppercase tracking-widest italic shadow-xl text-sm md:text-lg rounded-2xl active:scale-95 disabled:opacity-50">
                    {loading ? t('loading') : t('execute_booking')} <Zap size={16} fill="currentColor" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

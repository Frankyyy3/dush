import { useState, useEffect, useCallback } from 'react';
import { Check, Search, Trash2, Edit2, Filter, Wrench, CheckCircle2, AlertTriangle, BarChart3, Clock, UserX, Activity, TrendingUp, ShowerHead, WashingMachine, Calendar, Bell, Users, History, Megaphone, Globe, Plus, Send, X, KeyRound, ShieldBan, ShieldCheck, Ban } from 'lucide-react';
import { API_URL } from '../constants';
import { AttendanceSessionQr } from './AttendanceQr';

// --- Analytics Panel ---
const AnalyticsPanel = ({ bookings, t }) => {
  const now = new Date();

  // 1. Посещаемость
  const pastBookings = bookings.filter(b => {
    const timeParts = String(b.time).split(':').map(Number);
    const [h, m] = timeParts;
    const bTime = new Date(`${b.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    return now > bTime;
  });

  const attendedCount = pastBookings.filter(b => b.is_attended).length;
  const missedCount = pastBookings.length - attendedCount;
  const attendanceRate = pastBookings.length > 0 ? Math.round((attendedCount / pastBookings.length) * 100) : 100;

  // 2. Тип бронирований
  const showerCount = bookings.filter(b => b.type === 'shower' || !b.type).length;
  const laundryCount = bookings.filter(b => b.type === 'laundry').length;

  // 3. Пиковые часы нагрузки
  const timeSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

  const timeSlotCounts = {};
  timeSlots.forEach(slot => { timeSlotCounts[slot] = 0; });

  bookings.forEach(b => {
    const tStr = String(b.time).slice(0, 5);
    if (tStr in timeSlotCounts) {
      timeSlotCounts[tStr] += 1;
    }
  });

  const maxBookingsInSlot = Math.max(...Object.values(timeSlotCounts), 1);

  // 4. Нарушители (топ студентов по пропускам)
  const noShowsByStudent = {};
  pastBookings.forEach(b => {
    if (!b.is_attended && b.owner_name) {
      noShowsByStudent[b.owner_name] = (noShowsByStudent[b.owner_name] || 0) + 1;
    }
  });

  const offenders = Object.entries(noShowsByStudent)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Сводка в виде карточек */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border-4 border-slate-900 p-6 rounded-[2rem] shadow-[4px_4px_0_#000]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Всего броней</span>
            <span className="bg-blue-100 text-blue-600 p-1.5 rounded-lg"><Activity size={16} /></span>
          </div>
          <p className="text-4xl font-black">{bookings.length}</p>
        </div>

        <div className="bg-white border-4 border-slate-900 p-6 rounded-[2rem] shadow-[4px_4px_0_#000]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Посещаемость</span>
            <span className="bg-green-100 text-green-600 p-1.5 rounded-lg"><TrendingUp size={16} /></span>
          </div>
          <p className="text-4xl font-black">{attendanceRate}%</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Пришло {attendedCount} из {pastBookings.length}</p>
        </div>

        <div className="bg-white border-4 border-slate-900 p-6 rounded-[2rem] shadow-[4px_4px_0_#000]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Записи: Душ</span>
            <span className="bg-cyan-100 text-cyan-600 p-1.5 rounded-lg"><ShowerHead size={16} /></span>
          </div>
          <p className="text-4xl font-black">{showerCount}</p>
        </div>

        <div className="bg-white border-4 border-slate-900 p-6 rounded-[2rem] shadow-[4px_4px_0_#000]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Записи: Стирка</span>
            <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg"><WashingMachine size={16} /></span>
          </div>
          <p className="text-4xl font-black">{laundryCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Тепловая карта загруженности */}
        <div className="lg:col-span-2 bg-slate-50 border-4 border-slate-900 rounded-[3rem] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center">
              <Clock size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Пиковые часы нагрузки (Peak Hours Matrix)</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Загруженность временных интервалов</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {timeSlots.map(slot => {
              const count = timeSlotCounts[slot];
              const percentage = Math.round((count / maxBookingsInSlot) * 100);

              let densityBg = "bg-white border-slate-200 text-slate-800";

              if (count > 0) {
                if (percentage < 30) {
                  densityBg = "bg-blue-50 border-blue-100 text-slate-800";
                } else if (percentage < 70) {
                  densityBg = "bg-blue-100 border-blue-200 text-slate-800";
                } else {
                  densityBg = "bg-blue-600 border-blue-600 text-white";
                }
              }

              return (
                <div key={slot} className={`border-2 p-3.5 rounded-2xl flex justify-between items-center transition-all ${densityBg}`}>
                  <div>
                    <span className="text-sm font-black italic">{slot}</span>
                    <p className={`text-[8px] font-bold uppercase tracking-wider ${count > 0 && percentage >= 70 ? 'text-blue-100' : 'text-slate-400'}`}>
                      Записей: {count}
                    </p>
                  </div>
                  {count > 0 && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${percentage >= 70 ? 'bg-white text-blue-600 shadow-sm' : 'bg-blue-600 text-white'}`}>
                      {percentage}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Нарушители (топ неявок) */}
        <div className="bg-slate-50 border-4 border-slate-900 rounded-[3rem] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
              <UserX size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Рекордсмены неявок</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Прогуляли запись без отмены</p>
            </div>
          </div>

          {offenders.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-300">
              <CheckCircle2 size={32} className="mb-2 opacity-30" />
              <p className="font-black text-[10px] uppercase tracking-widest">Все дисциплинированы!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offenders.map((item, index) => (
                <div key={item.name} className="bg-white border-2 border-slate-100 p-4 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 font-black text-xs flex items-center justify-center">
                    0{index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs uppercase text-slate-900 truncate">{item.name}</p>
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Неявок: {item.count}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Maintenance Panel ---
const MaintenancePanel = ({ t, user, notify }) => {
  const [booths, setBooths] = useState([]);
  const [reasonInput, setReasonInput] = useState({});
  const [dormList, setDormList] = useState([]);
  // UNIT-ALL admins and admins with multiple dorms can pick which dorm to manage
  const isAdminWithMultiple = user.role === 'admin' && user.accessible_dorms && user.accessible_dorms.length > 1;
  const initialDorm = user.dorm_name === 'UNIT-ALL' ? '' : (user.accessible_dorms?.[0] || user.dorm_name);
  const [selectedDorm, setSelectedDorm] = useState(initialDorm);
  const [activeType, setActiveType] = useState('shower');
  const activeDorm = (user.dorm_name === 'UNIT-ALL' || isAdminWithMultiple) ? selectedDorm : user.dorm_name;
  const [boothCount, setBoothCount] = useState(4);

  // Новые настройки времени
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("21:00");
  const [slotDuration, setSlotDuration] = useState(30);
  const [disabledSlots, setDisabledSlots] = useState([]);

  // Санитарные дни / Праздники
  const [holidayBlocks, setHolidayBlocks] = useState([]);
  const [hStartDate, setHStartDate] = useState('');
  const [hEndDate, setHEndDate] = useState('');
  const [hReason, setHReason] = useState('');

  // Загружаем список общаг из реальных данных Nitro
  useEffect(() => {
    if (user.dorm_name !== 'UNIT-ALL') return;
    fetch(`${API_URL}/admin/dorms`, {
      headers: { 'Authorization': `Bearer ${user.token}` }
    })
      .then(r => r.json())
      .then(data => setDormList(data))
      .catch(console.error);
  }, []);

  const fetchBooths = async () => {
    if (!activeDorm) return;
    try {
      const res = await fetch(`${API_URL}/admin/booths?dorm_name=${encodeURIComponent(activeDorm)}&type=${activeType}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      setBooths(data);

      const cfgRes = await fetch(`${API_URL}/dorm-config?dorm_name=${encodeURIComponent(activeDorm)}`);
      const cfgData = await cfgRes.json();
      setBoothCount(activeType === 'shower' ? cfgData.shower_count : cfgData.laundry_count);

      // Загружаем настройки расписания
      setStartTime(cfgData.start_time || "08:00");
      setEndTime(cfgData.end_time || "21:00");
      setSlotDuration(cfgData.slot_duration || 30);
      try {
        setDisabledSlots(JSON.parse(cfgData.disabled_slots || "[]"));
      } catch (e) {
        setDisabledSlots([]);
      }

      // Загружаем список праздников / санитарных дней
      const holRes = await fetch(`${API_URL}/admin/holiday-blocks?dorm_name=${encodeURIComponent(activeDorm)}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const holData = await holRes.json();
      setHolidayBlocks(Array.isArray(holData) ? holData : []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchBooths(); }, [activeDorm, activeType]);

  const toggleBooth = async (booth, currentStatus) => {
    if (!activeDorm) return notify('Выберите общежитие');
    const newStatus = !currentStatus;
    const reason = reasonInput[`${booth}_${activeType}`] || 'Технические работы';
    try {
      const res = await fetch(`${API_URL}/admin/booths/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          booth,
          dorm_name: activeDorm,
          is_active: newStatus,
          reason: newStatus ? null : reason,
          type: activeType
        })
      });
      if (res.ok) {
        notify(newStatus
          ? `${activeType === 'shower' ? 'Кабинка' : 'Машина'} №${booth} снова активна!`
          : `${activeType === 'shower' ? 'Кабинка' : 'Машина'} №${booth} закрыта на ремонт`
        );
        fetchBooths();
      }
    } catch (e) { console.error(e); }
  };

  const updateCount = async (delta) => {
    if (!activeDorm) return;
    const newCount = boothCount + delta;
    if (newCount < 1 || newCount > 10) return notify('Лимит: 1-10');

    try {
      const res = await fetch(`${API_URL}/admin/dorm-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          dorm_name: activeDorm,
          [activeType === 'shower' ? 'shower_count' : 'laundry_count']: newCount
        })
      });
      if (res.ok) {
        setBoothCount(newCount);
        fetchBooths();
        notify(`Количество обновлено до ${newCount}`);
      }
    } catch (e) { console.error(e); }
  };

  // Сохранение настроек времени
  const saveTimeSettings = async (newDisabledSlots = null) => {
    try {
      const slotsToSave = newDisabledSlots !== null ? newDisabledSlots : disabledSlots;
      const res = await fetch(`${API_URL}/admin/dorm-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          dorm_name: activeDorm,
          start_time: startTime,
          end_time: endTime,
          slot_duration: parseInt(slotDuration),
          disabled_slots: JSON.stringify(slotsToSave)
        })
      });
      if (res.ok) {
        notify('Настройки времени обновлены!');
        fetchBooths();
      }
    } catch (e) { console.error(e); }
  };

  // Переключение блокировки отдельного временного слота
  const toggleSlotDisabled = (slot) => {
    let updated;
    if (disabledSlots.includes(slot)) {
      updated = disabledSlots.filter(s => s !== slot);
    } else {
      updated = [...disabledSlots, slot];
    }
    setDisabledSlots(updated);
    saveTimeSettings(updated);
  };

  // Генерация слотов времени
  const getAdminTimeSlots = () => {
    const slots = [];
    try {
      let curr = new Date(`2026-01-01T${startTime}:00`);
      const end = new Date(`2026-01-01T${endTime}:00`);
      while (curr.getTime() + slotDuration * 60000 <= end.getTime()) {
        const h = String(curr.getHours()).padStart(2, '0');
        const m = String(curr.getMinutes()).padStart(2, '0');
        slots.push(`${h}:${m}`);
        curr = new Date(curr.getTime() + slotDuration * 60000);
      }
    } catch (e) {
      return ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];
    }
    return slots;
  };

  // Создание блокировки на праздники/санитарные дни
  const addHolidayBlock = async (e) => {
    e.preventDefault();
    if (!hStartDate || !hEndDate || !hReason) return notify('Заполните все поля периода');
    try {
      const res = await fetch(`${API_URL}/admin/holiday-blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          dorm_name: activeDorm,
          start_date: hStartDate,
          end_date: hEndDate,
          reason: hReason
        })
      });
      if (res.ok) {
        notify('Период блокировки успешно добавлен!');
        setHStartDate('');
        setHEndDate('');
        setHReason('');
        fetchBooths();
      }
    } catch (e) { console.error(e); }
  };

  // Удаление праздничного периода
  const deleteHolidayBlock = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/holiday-blocks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (res.ok) {
        notify('Период разблокирован!');
        fetchBooths();
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="bg-slate-50 border-4 border-slate-900 rounded-[2.5rem] p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-2xl flex items-center justify-center">
            <Wrench size={20} className="text-orange-600" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Кабинки и Расписание</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {activeDorm || 'Выберите общежитие'}
            </p>
          </div>
        </div>

        {/* Селекторы */}
        <div className="flex gap-2">
          <select
            value={activeType}
            onChange={e => setActiveType(e.target.value)}
            className="bg-white border-4 border-slate-900 px-4 py-2.5 rounded-2xl font-black text-xs uppercase outline-none focus:ring-4 focus:ring-blue-600/10 cursor-pointer"
          >
            <option value="shower">{t('booth')}</option>
            <option value="laundry">{t('laundry')}</option>
          </select>

          {(user.dorm_name === 'UNIT-ALL' || isAdminWithMultiple) && (
            <select
              value={selectedDorm}
              onChange={e => { setSelectedDorm(e.target.value); setBooths([]); }}
              className="bg-white border-4 border-slate-900 px-4 py-2.5 rounded-2xl font-black text-xs uppercase outline-none focus:ring-4 focus:ring-blue-600/10 cursor-pointer"
            >
              <option value="" disabled>— Выберите общежитие —</option>
              {user.dorm_name === 'UNIT-ALL' ? (
                dormList.length === 0
                  ? <option disabled>Загрузка...</option>
                  : dormList.map(d => <option key={d} value={d}>{d}</option>)
              ) : (
                user.accessible_dorms?.map(d => <option key={d} value={d}>{d}</option>)
              )}
            </select>
          )}
        </div>
      </div>

      {!activeDorm ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-300">
          <Wrench size={32} className="mb-3 opacity-30" />
          <p className="font-black text-xs uppercase tracking-widest">Выберите общежитие выше</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Левая колонка: Кабинки */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border-4 border-slate-900 p-6 rounded-3xl shadow-[4px_4px_0_#000]">
              <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider mb-4">Управление количеством</h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Всего {activeType === 'shower' ? 'кабинок' : 'машин'}</p>
                  <p className="text-3xl font-black">{boothCount}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateCount(-1)} className="w-12 h-12 bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 rounded-2xl font-black text-xl flex items-center justify-center transition-all shadow-[2px_2px_0_#ccc] active:translate-y-0.5 active:shadow-none">-</button>
                  <button onClick={() => updateCount(1)} className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl flex items-center justify-center transition-all shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none">+</button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider">Список и статус</h4>
              {booths.map(b => (
                <div key={b.booth} className={`flex items-center gap-3 p-4 rounded-3xl border-4 transition-all ${b.is_active ? 'bg-white border-slate-900' : 'bg-orange-50 border-orange-400 shadow-[3px_3px_0_#fb923c]'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${b.is_active ? 'bg-slate-900 text-white' : 'bg-orange-200 text-orange-700'}`}>
                    {b.booth}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs uppercase text-slate-900">{activeType === 'shower' ? t('booth') : t('washing_machine')} №{b.booth}</p>
                    {!b.is_active && b.reason && (
                      <p className="text-[9px] font-bold text-orange-600 uppercase truncate mt-0.5">{b.reason}</p>
                    )}
                    {b.is_active && (
                      <input
                        type="text"
                        placeholder="Причина ремонта..."
                        value={reasonInput[`${b.booth}_${activeType}`] || ''}
                        onChange={e => setReasonInput(prev => ({ ...prev, [`${b.booth}_${activeType}`]: e.target.value }))}
                        className="mt-1 text-[9px] font-bold bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg outline-none w-full max-w-[180px] focus:border-slate-400 uppercase"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => toggleBooth(b.booth, b.is_active)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl font-black text-[9px] uppercase tracking-widest border-2 transition-all ${b.is_active
                        ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                        : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                      }`}
                  >
                    {b.is_active
                      ? <><Wrench size={10} /> В ремонт</>
                      : <><CheckCircle2 size={10} /> Открыть</>
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Правая колонка: Время и блокировки */}
          <div className="lg:col-span-6 space-y-6">
            {/* 1. Глобальное время */}
            <div className="bg-white border-4 border-slate-900 p-6 rounded-3xl shadow-[4px_4px_0_#000]">
              <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
                <Clock size={14} className="text-blue-600" /> Настройка часов работы
              </h4>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">С (Открытие)</label>
                  <input
                    type="text"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-3 text-center text-xs font-black outline-none focus:border-blue-600 uppercase"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">До (Закрытие)</label>
                  <input
                    type="text"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-3 text-center text-xs font-black outline-none focus:border-blue-600 uppercase"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Шаг сеанса</label>
                  <select
                    value={slotDuration}
                    onChange={e => setSlotDuration(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-1 text-center text-xs font-black outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value={30}>30 мин</option>
                    <option value={45}>45 мин</option>
                    <option value={60}>60 мин</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => saveTimeSettings()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none"
              >
                Сохранить настройки часов
              </button>
              {user.dorm_name === 'UNIT-ALL' && (
                <button
                  onClick={async () => {
                    if (!confirm(`Применить расписание ${startTime}–${endTime} (шаг ${slotDuration} мин) ко ВСЕМ общежитиям?`)) return;
                    try {
                      const res = await fetch(`${API_URL}/admin/global-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                        body: JSON.stringify({ start_time: startTime, end_time: endTime, slot_duration: parseInt(slotDuration), dorms: [] })
                      });
                      const data = await res.json();
                      if (res.ok) notify(`✅ Применено к ${data.updated_dorms.length} общежитиям!`);
                      else notify('❌ ' + (data.detail || 'Ошибка'));
                    } catch (e) { notify('Ошибка сети'); }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-[2px_2px_0_#1e40af] active:translate-y-0.5 active:shadow-none"
                >
                  <Globe size={12} /> Применить ко всем общежитиям
                </button>
              )}
            </div>

            {/* 2. Блокировщик слотов (Санитарный час) */}
            <div className="bg-white border-4 border-slate-900 p-6 rounded-3xl shadow-[4px_4px_0_#000]">
              <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-orange-500" /> Санитарный час / Выключение слотов
              </h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase mb-4 leading-relaxed">
                Нажмите на слот времени, чтобы заблокировать его для студентов (например, санитарный час на уборку).
              </p>
              <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {getAdminTimeSlots().map(slot => {
                  const isDisabled = disabledSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => toggleSlotDisabled(slot)}
                      className={`py-2 px-1.5 border-2 rounded-xl text-[9px] font-black transition-all text-center
                        ${isDisabled
                          ? 'bg-red-50 text-red-600 border-red-300 shadow-sm'
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-800 hover:text-slate-800'
                        }
                      `}
                    >
                      {slot} {isDisabled ? '🔒' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Календарь санитарных дней и праздников */}
            <div className="bg-white border-4 border-slate-900 p-6 rounded-3xl shadow-[4px_4px_0_#000]">
              <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
                <Calendar size={14} className="text-red-500" /> Календарь санитарных дней и праздников
              </h4>

              <form onSubmit={addHolidayBlock} className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">С даты</label>
                    <input
                      type="date"
                      value={hStartDate}
                      onChange={e => setHStartDate(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-2 text-[10px] font-black outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">По дату</label>
                    <input
                      type="date"
                      value={hEndDate}
                      onChange={e => setHEndDate(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2 px-2 text-[10px] font-black outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Причина блокировки</label>
                  <input
                    type="text"
                    placeholder="Например: Профилактика бойлера..."
                    value={hReason}
                    onChange={e => setHReason(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 text-[10px] font-black outline-none focus:border-blue-600 uppercase"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none"
                >
                  Заблокировать выбранные даты
                </button>
              </form>

              {/* Список активных блокировок */}
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Активные блокировки</h5>
                {holidayBlocks.length === 0 ? (
                  <p className="text-[9px] font-bold text-slate-300 uppercase py-2">Нет заблокированных периодов</p>
                ) : (
                  holidayBlocks.map(hb => (
                    <div key={hb.id} className="bg-red-50/50 border border-red-200 p-3 rounded-2xl flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-[9px] text-red-950 uppercase leading-tight">
                          {hb.start_date} — {hb.end_date}
                        </p>
                        <p className="font-bold text-[8px] text-red-500 uppercase truncate mt-0.5">
                          {hb.reason}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteHolidayBlock(hb.id)}
                        className="text-red-400 hover:text-red-600 transition-colors p-1.5 shrink-0"
                        title="Удалить блокировку"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Admins List Panel (Superadmin Only) ---
const AdminsListPanel = ({ user, notify, t }) => {
  const [admins, setAdmins] = useState([]);
  const [dorms, setDorms] = useState([]);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [tempDorms, setTempDorms] = useState([]);
  const [tempCanSendPush, setTempCanSendPush] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullname, setNewFullname] = useState('');
  const [newDorms, setNewDorms] = useState([]);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newLogin.trim() || !newPassword.trim() || !newFullname.trim()) return notify('Заполните все поля');
    if (newDorms.length === 0) return notify('Выберите хотя бы одно общежитие');
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/admin/create-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ login: newLogin, password: newPassword, fullname: newFullname, dorms: newDorms })
      });
      const data = await res.json();
      if (res.ok) {
        notify(`✅ Комендант «${newFullname}» создан! Логин: ${newLogin}`);
        setShowCreate(false);
        setNewLogin(''); setNewPassword(''); setNewFullname(''); setNewDorms([]);
        fetchData();
      } else {
        notify('❌ ' + (data.detail || 'Ошибка создания'));
      }
    } catch (e) {
      notify('Ошибка сети');
    } finally {
      setCreating(false);
    }
  };

  const toggleNewDorm = (dorm) => {
    setNewDorms(prev => prev.includes(dorm) ? prev.filter(d => d !== dorm) : [...prev, dorm]);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [adminsRes, dormsRes] = await Promise.all([
        fetch(`${API_URL}/admin/admins_list`, { headers: { 'Authorization': `Bearer ${user.token}` } }),
        fetch(`${API_URL}/admin/dorms`, { headers: { 'Authorization': `Bearer ${user.token}` } })
      ]);
      const adminsData = await adminsRes.json();
      const dormsData = await dormsRes.json();
      setAdmins(adminsData);
      setDorms(dormsData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (admin) => {
    if (admin.dorm_name === 'UNIT-ALL') return notify('Нельзя редактировать главного админа');
    setEditingAdmin(admin);
    setTempDorms(admin.accessible_dorms || []);
    setTempCanSendPush(admin.can_send_push || false);
  };

  const toggleDorm = (dorm) => {
    if (tempDorms.includes(dorm)) {
      setTempDorms(tempDorms.filter(d => d !== dorm));
    } else {
      setTempDorms([...tempDorms, dorm]);
    }
  };

  const handleSave = async () => {
    try {
      const resDorms = await fetch(`${API_URL}/admin/admins_list/${editingAdmin.id}/dorms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ dorms: tempDorms })
      });
      const resPush = await fetch(`${API_URL}/admin/admins_list/${editingAdmin.id}/push-permission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ can_send_push: tempCanSendPush })
      });
      if (resDorms.ok && resPush.ok) {
        notify('Доступы успешно обновлены!');
        setEditingAdmin(null);
        fetchData();
      } else {
        const error = await resDorms.json();
        notify(error.detail || 'Ошибка при сохранении');
      }
    } catch (e) {
      console.error(e);
      notify('Ошибка сети при сохранении');
    }
  };

  return (
    <div className="bg-slate-50 border-4 border-slate-900 rounded-[2.5rem] p-6 md:p-8 animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <Users size={20} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Управление комендантами</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Привязка общежитий к администраторам</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-[3px_3px_0_#312e81] active:translate-y-0.5 active:shadow-none transition-all"
        >
          <Plus size={14} /> Создать аккаунт
        </button>
      </div>

      {/* Модалка создания коменданта */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-slate-900 rounded-[2rem] shadow-[8px_8px_0_#000] w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-6 border-b-4 border-slate-900 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">Новый комендант</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Создать аккаунт сотрудника</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-900 p-1">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1.5">Полное имя</label>
                <input
                  type="text"
                  value={newFullname}
                  onChange={e => setNewFullname(e.target.value)}
                  placeholder="Бакытбеков Елнар"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-indigo-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1.5">Логин</label>
                  <input
                    type="text"
                    value={newLogin}
                    onChange={e => setNewLogin(e.target.value)}
                    placeholder="admin_ds6"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-3 text-sm font-bold outline-none focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 block mb-1.5">Пароль</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-3 text-sm font-bold outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-2">Общежития (выберите хотя бы одно)</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {dorms.map(dorm => (
                    <label key={dorm} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${newDorms.includes(dorm) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'
                      }`}>
                      <input type="checkbox" checked={newDorms.includes(dorm)} onChange={() => toggleNewDorm(dorm)} className="w-4 h-4" />
                      <span className="font-black text-[10px] uppercase">{dorm}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-3 bg-white border-2 border-slate-200 font-black text-xs uppercase rounded-xl hover:bg-slate-50">
                  Отмена
                </button>
                <button type="submit" disabled={creating} className="flex-1 py-3 bg-indigo-600 text-white font-black text-xs uppercase rounded-xl hover:bg-indigo-700 shadow-[2px_2px_0_#312e81] active:translate-y-0.5 active:shadow-none disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? 'Создание...' : <><KeyRound size={13} /> Создать</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-3">
          <thead>
            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <th className="px-6 text-left pb-4">ID / Логин</th>
              <th className="px-6 text-left pb-4">Имя</th>
              <th className="px-6 text-left pb-4">Доступные общежития</th>
              <th className="px-6 text-right pb-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id} className="bg-white border-2 border-slate-100 hover:shadow-md transition-all">
                <td className="px-6 py-4 rounded-l-2xl">
                  <p className="font-black text-slate-900 text-xs">#{a.id}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{a.student_id}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="font-black text-xs uppercase">{a.fullname}</p>
                  {a.dorm_name === 'UNIT-ALL' && <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-600 text-[8px] font-black rounded uppercase">Superadmin</span>}
                </td>
                <td className="px-6 py-4">
                  {a.dorm_name === 'UNIT-ALL' ? (
                    <span className="text-xs font-black italic">Полный доступ</span>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {a.accessible_dorms?.map(d => (
                          <span key={d} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[9px] font-black rounded border border-indigo-100">
                            {d}
                          </span>
                        ))}
                        {(!a.accessible_dorms || a.accessible_dorms.length === 0) && (
                          <span className="text-[10px] font-bold text-slate-400 italic">Нет доступов</span>
                        )}
                      </div>
                      {a.can_send_push && (
                        <div className="mt-2 text-[9px] font-black text-amber-600 uppercase flex items-center gap-1">
                          <Megaphone size={10} /> Есть доступ к рассылке
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="px-6 py-4 rounded-r-2xl text-right">
                  {a.dorm_name !== 'UNIT-ALL' && (
                    <button onClick={() => handleEdit(a)} className="text-blue-600 hover:text-blue-800 p-2 transition-colors inline-flex items-center gap-1 font-black text-[10px] uppercase">
                      <Edit2 size={14} /> Изменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-slate-900 rounded-[2rem] shadow-[8px_8px_0_#000] w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="p-6 border-b-4 border-slate-900 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">Доступы коменданта</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">{editingAdmin.fullname} ({editingAdmin.student_id})</p>
              </div>
              <button onClick={() => setEditingAdmin(null)} className="text-slate-400 hover:text-slate-900 font-black px-3 py-1">✕</button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <p className="text-xs font-black text-slate-900 uppercase mb-4">Выберите общежития:</p>
              <div className="space-y-2">
                {dorms.map(dorm => (
                  <label key={dorm} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${tempDorms.includes(dorm) ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'}`}>
                    <input
                      type="checkbox"
                      checked={tempDorms.includes(dorm)}
                      onChange={() => toggleDorm(dorm)}
                      className="w-5 h-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="font-black text-xs uppercase">{dorm}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t-4 border-slate-100">
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${tempCanSendPush ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-400'}`}>
                  <input
                    type="checkbox"
                    checked={tempCanSendPush}
                    onChange={(e) => setTempCanSendPush(e.target.checked)}
                    className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600 focus:ring-amber-600 outline-none"
                  />
                  <div>
                    <span className="font-black text-xs uppercase block text-slate-900">Доступ к рассылке PUSH</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mt-1">Разрешить отправку объявлений</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="p-6 border-t-4 border-slate-900 bg-slate-50 flex gap-3">
              <button onClick={() => setEditingAdmin(null)} className="flex-1 py-3 px-4 bg-white border-2 border-slate-200 text-slate-600 font-black text-[10px] uppercase rounded-xl hover:bg-slate-100 transition-all">
                Отмена
              </button>
              <button onClick={handleSave} className="flex-1 py-3 px-4 bg-indigo-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-indigo-700 shadow-[2px_2px_0_#3730a3] active:translate-y-0.5 active:shadow-none transition-all">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Announcements (Mass Push) Panel ---
const AnnouncementsPanel = ({ user, notify }) => {
  const [dormList, setDormList] = useState([]);
  const [selectedDorms, setSelectedDorms] = useState([]);
  const [title, setTitle] = useState('Объявление от администрации');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [preview, setPreview] = useState({ devices: 0, students: 0 });

  useEffect(() => {
    fetch(`${API_URL}/admin/dorms`, { headers: { 'Authorization': `Bearer ${user.token}` } })
      .then(r => r.json())
      .then(data => setDormList(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const templates = [
    { title: 'Объявление от администрации', message: 'Уважаемые студенты! Информируем об изменении в расписании душа.' },
    { title: 'Санитарный день', message: 'Завтра санитарный день: душ временно не работает с 10:00 до 14:00. Приносим извинения.' },
    { title: 'Важно: прачечная', message: 'Сегодня прачечная закрыта на техническое обслуживание до 18:00.' },
  ];

  useEffect(() => {
    const params = new URLSearchParams();
    selectedDorms.forEach(d => params.append('dorms', d));
    fetch(`${API_URL}/admin/mass-push/preview?${params}`, {
      headers: { 'Authorization': `Bearer ${user.token}` }
    })
      .then(r => r.ok ? r.json() : { devices: 0, students: 0 })
      .then(data => setPreview({ devices: data.devices || 0, students: data.students || 0 }))
      .catch(() => setPreview({ devices: 0, students: 0 }));
  }, [selectedDorms, user.token]);

  const toggleDorm = (dorm) => {
    setSelectedDorms(prev =>
      prev.includes(dorm) ? prev.filter(d => d !== dorm) : [...prev, dorm]
    );
  };

  const handleSend = async () => {
    if (!message.trim()) return notify('Напишите текст объявления');
    const targetLabel = selectedDorms.length === 0
      ? 'всем доступным общежитиям'
      : `${selectedDorms.length} общежитиям`;
    const confirmText = `Отправить объявление ${targetLabel}?\n\nУстройств с push: ${preview.devices}\nСтудентов: ${preview.students}`;
    if (!window.confirm(confirmText)) return;
    if (preview.devices === 0) return notify('Нет активных push-подписок у выбранных получателей');

    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/mass-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ title, message, dorms: selectedDorms })
      });
      const data = await res.json();
      if (res.ok) {
        setLastResult(data);
        notify(`✅ Рассылка запущена: ${data.devices} устройств, ${data.students} студентов`);
        setMessage('');
        setSelectedDorms([]);
      } else {
        notify('❌ ' + (data.detail || 'Ошибка отправки'));
      }
    } catch (e) {
      notify('Ошибка сети');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-slate-50 border-4 border-slate-900 rounded-[2.5rem] p-6 md:p-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-white border-2 border-slate-900 rounded-2xl flex items-center justify-center shadow-[3px_3px_0_#0f172a] overflow-hidden p-1">
          <img src="/university_logo.png" alt="Shakarim University" className="w-full h-full object-contain" />
        </div>
        <div>
          <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Массовые объявления</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PUSH на все устройства студента (iPhone + Android)</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-2xl">
        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">Устройств (push)</p>
          <p className="text-xl font-black text-blue-700">{preview.devices}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">Студентов</p>
          <p className="text-xl font-black text-blue-700">{preview.students}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="text-[9px] font-black uppercase text-slate-400 w-full">Шаблоны:</span>
        {templates.map((tpl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setTitle(tpl.title); setMessage(tpl.message); }}
            className="px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-[9px] font-black uppercase hover:border-amber-500 transition-colors"
          >
            {tpl.title.slice(0, 22)}…
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Выбор общежитий */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider">Получатели</h4>
            <button
              onClick={() => setSelectedDorms(selectedDorms.length === dormList.length ? [] : [...dormList])}
              className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
            >
              {selectedDorms.length === dormList.length ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {dormList.map(dorm => (
              <label key={dorm} className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${selectedDorms.includes(dorm) ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-400'
                }`}>
                <input
                  type="checkbox"
                  checked={selectedDorms.includes(dorm)}
                  onChange={() => toggleDorm(dorm)}
                  className="w-4 h-4 rounded"
                />
                <span className="font-black text-[10px] uppercase">{dorm}</span>
              </label>
            ))}
            {dormList.length === 0 && (
              <p className="text-[10px] font-bold text-slate-400 uppercase py-4 text-center">Загрузка...</p>
            )}
          </div>
          {selectedDorms.length === 0 && (
            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle size={10} /> Не выбраны — будет отправлено ВСЕМ
            </p>
          )}
          {selectedDorms.length > 0 && (
            <p className="text-[9px] font-bold text-green-600 uppercase tracking-wider">
              ✓ Выбрано: {selectedDorms.length} из {dormList.length}
            </p>
          )}
        </div>

        {/* Форма сообщения */}
        <div className="lg:col-span-8 space-y-4">
          <div>
            <label className="text-[8px] font-black uppercase text-slate-400 block mb-2">Заголовок уведомления</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Объявление от администрации"
              className="w-full bg-white border-2 border-slate-200 rounded-2xl py-3 px-4 text-sm font-black outline-none focus:border-amber-500 transition-all"
            />
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-slate-400 block mb-2">Текст объявления</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Например: Внимание! Завтра в Студенческом доме №3 санитарный день, душ не работает с 10:00 до 14:00."
              rows={6}
              className="w-full bg-white border-2 border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:border-amber-500 transition-all resize-none leading-relaxed"
            />
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 text-right">{message.length} символов</p>
          </div>

          {/* Превью */}
          {message && (
            <div className="bg-white border-4 border-slate-900 rounded-2xl p-4 shadow-[4px_4px_0_#0f172a]">
              <p className="text-[8px] font-black uppercase text-slate-400 mb-3">Превью push-уведомления</p>
              <div className="flex gap-3 items-start bg-slate-50 border-2 border-slate-200 rounded-xl p-3">
                <img src="/university_logo.png" alt="" className="w-10 h-10 rounded-lg border border-slate-200 bg-white object-contain shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-blue-600 tracking-wider">AQUA.FLOW</p>
                  <p className="font-black text-sm text-slate-900 mt-0.5 truncate">{title}</p>
                  <p className="text-xs font-bold text-slate-600 mt-1 leading-relaxed">{message}</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[3px_3px_0_#000] active:translate-y-0.5 active:shadow-none ${sending || !message.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
          >
            <Send size={14} />
            {sending ? 'Запуск...' : `Отправить (${preview.devices} устр.)`}
          </button>

          {lastResult && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4">
              <p className="font-black text-xs text-green-700 uppercase">Последняя рассылка</p>
              <p className="text-sm font-bold text-slate-700 mt-2">
                {lastResult.status === 'queued'
                  ? `В очереди: ${lastResult.devices} устройств, ${lastResult.students} студентов. Итог — в журнале аудита.`
                  : lastResult.message || 'Готово'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Audit Logs Panel (Superadmin Only) ---
const AuditLogsPanel = ({ user, notify }) => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/admin/audit-logs`, { headers: { 'Authorization': `Bearer ${user.token}` } })
      .then(r => r.json())
      .then(data => setLogs(data))
      .catch(console.error);
  }, []);

  return (
    <div className="bg-slate-50 border-4 border-slate-900 p-6 md:p-10 rounded-[3rem] animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center">
          <History size={20} className="text-purple-600" />
        </div>
        <div>
          <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Журнал действий (Аудит)</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">История действий администраторов</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <th className="px-4 text-left pb-2">Время</th>
              <th className="px-4 text-left pb-2">Администратор</th>
              <th className="px-4 text-left pb-2">Действие</th>
              <th className="px-4 text-left pb-2">Детали</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const dt = new Date(log.created_at);
              return (
                <tr key={log.id} className="bg-white border-2 border-slate-100">
                  <td className="px-4 py-3 rounded-l-xl">
                    <p className="font-black text-[10px] text-slate-900">{dt.toLocaleDateString()}</p>
                    <p className="text-[9px] font-bold text-slate-400">{dt.toLocaleTimeString()}</p>
                  </td>
                  <td className="px-4 py-3 font-black text-[10px] uppercase text-blue-600">{log.admin_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-[8px] font-black rounded uppercase ${log.action === 'delete' ? 'bg-red-100 text-red-600' :
                        log.action === 'verify' ? 'bg-green-100 text-green-600' :
                          log.action === 'mass_push' ? 'bg-amber-100 text-amber-700' :
                            log.action === 'update' ? 'bg-orange-100 text-orange-600' :
                              'bg-slate-100 text-slate-600'
                      }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-[10px] text-slate-600 rounded-r-xl">{log.details}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr><td colSpan="4" className="text-center py-4 text-slate-400 text-xs font-bold uppercase">Записей нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Banned Students Panel (Superadmin Only) ---
const BannedStudentsPanel = ({ user, notify }) => {
  const [bannedList, setBannedList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBanForm, setShowBanForm] = useState(false);
  const [banStudentId, setBanStudentId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);

  useEffect(() => { fetchBanned(); }, []);

  const fetchBanned = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/banned-students`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      setBannedList(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleUnban = async (banId, studentName) => {
    if (!confirm(`Разблокировать студента «${studentName}»?`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/banned-students/${banId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (res.ok) { notify(`✅ ${data.message}`); fetchBanned(); }
      else { notify('❌ ' + (data.detail || 'Ошибка')); }
    } catch (e) { notify('Ошибка сети'); }
  };

  const handleBan = async (e) => {
    e.preventDefault();
    if (!banStudentId.trim()) return notify('Укажите ID студента');
    setBanning(true);
    try {
      const res = await fetch(`${API_URL}/admin/ban-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ student_id: banStudentId.trim(), reason: banReason.trim() || 'Нарушение правил' })
      });
      const data = await res.json();
      if (res.ok) {
        notify(`✅ ${data.message}`);
        setBanStudentId(''); setBanReason(''); setShowBanForm(false);
        fetchBanned();
      } else { notify('❌ ' + (data.detail || 'Ошибка')); }
    } catch (e) { notify('Ошибка сети'); }
    finally { setBanning(false); }
  };

  return (
    <div className="bg-slate-50 border-4 border-slate-900 rounded-[2.5rem] p-6 md:p-10 animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
            <ShieldBan size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Заблокированные студенты</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Чёрный список — управление блокировками</p>
          </div>
        </div>
        <button
          onClick={() => setShowBanForm(true)}
          className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-red-700 shadow-[3px_3px_0_#7f1d1d] active:translate-y-0.5 active:shadow-none transition-all"
        >
          <Ban size={14} /> Заблокировать
        </button>
      </div>

      {showBanForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-slate-900 rounded-[2rem] shadow-[8px_8px_0_#000] w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-6 border-b-4 border-slate-900 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">Заблокировать студента</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Добавить в чёрный список</p>
              </div>
              <button onClick={() => setShowBanForm(false)} className="text-slate-400 hover:text-slate-900 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleBan} className="p-6 space-y-4">
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1.5">ID студента (логин из Платонуса)</label>
                <input type="text" value={banStudentId} onChange={e => setBanStudentId(e.target.value)} placeholder="Например: 12345678" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-red-600" />
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1.5">Причина блокировки</label>
                <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Нарушение правил, порча имущества..." className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-red-600" />
              </div>
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3">
                <p className="text-[9px] font-black text-red-600 uppercase leading-relaxed flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Студент не сможет войти в систему до разблокировки
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowBanForm(false)} className="flex-1 py-3 bg-white border-2 border-slate-200 font-black text-xs uppercase rounded-xl hover:bg-slate-50">Отмена</button>
                <button type="submit" disabled={banning} className="flex-1 py-3 bg-red-600 text-white font-black text-xs uppercase rounded-xl hover:bg-red-700 shadow-[2px_2px_0_#7f1d1d] active:translate-y-0.5 active:shadow-none disabled:opacity-50 flex items-center justify-center gap-2">
                  {banning ? 'Блокировка...' : <><Ban size={13} /> Заблокировать</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-black text-xs uppercase tracking-widest text-slate-400 animate-pulse">Загрузка...</p>
        </div>
      ) : bannedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-300">
          <ShieldCheck size={40} className="mb-3 opacity-30" />
          <p className="font-black text-xs uppercase tracking-widest">Нет заблокированных студентов</p>
          <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Чёрный список пуст</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Всего заблокировано: {bannedList.length}</p>
          {bannedList.map(b => {
            const dt = b.banned_at ? new Date(b.banned_at) : null;
            return (
              <div key={b.id} className="bg-white border-4 border-red-200 p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center gap-4 transition-all hover:shadow-md">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0"><Ban size={18} /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm uppercase text-slate-900 truncate">{b.student_name}</p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5">ID: {b.student_id} • {b.dorm_name}</p>
                  <p className="text-[9px] font-bold text-red-500 uppercase mt-1">Причина: {b.reason || '—'}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    {dt && <span className="text-[8px] font-bold text-slate-400 uppercase">Заблокирован: {dt.toLocaleDateString()} {dt.toLocaleTimeString()}</span>}
                    {b.banned_by_name && <span className="text-[8px] font-bold text-slate-400 uppercase">Кем: {b.banned_by_name}</span>}
                  </div>
                </div>
                <button onClick={() => handleUnban(b.id, b.student_name)} className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border-2 border-green-300 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-green-100 hover:border-green-400 transition-all shadow-[2px_2px_0_#bbf7d0] active:translate-y-0.5 active:shadow-none">
                  <ShieldCheck size={14} /> Разблокировать
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Main Admin Panel ---
export const AdminPanelView = ({ t, onRefresh, notify, user }) => {
  const [allBookings, setAllBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [attendanceQr, setAttendanceQr] = useState(null);
  const [attendanceQrLoading, setAttendanceQrLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'maintenance'

  const [filterDorm, setFilterDorm] = useState('ALL');
  const availableDorms = Array.from(new Set(allBookings.map(b => b.dorm_name))).filter(Boolean);
  const isAdminWithMultiple = user.role === 'admin' && user.accessible_dorms && user.accessible_dorms.length > 1;
  const showDormFilter = user.dorm_name === 'UNIT-ALL' || isAdminWithMultiple;

  const generateAttendanceQr = async () => {
    setAttendanceQrLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/attendance-qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JSON.parse(localStorage.getItem('user')).token}`
        },
        body: JSON.stringify({ dorm_name: filterDorm === 'ALL' ? null : filterDorm }),
      });
      const data = await response.json();
      if (!response.ok) {
        notify(data.detail || t('attendance_qr_failed'));
        return;
      }
      setAttendanceQr({ ...data, scope: filterDorm });
    } catch (error) {
      console.error('Unable to generate attendance QR:', error);
      notify(t('attendance_qr_failed'));
    } finally {
      setAttendanceQrLoading(false);
    }
  };

  const handleSendNotification = async (bookingId) => {
    try {
      const res = await fetch(`${API_URL}/admin/test-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ booking_id: bookingId })
      });
      const data = await res.json();
      notify(res.ok ? '✅ ' + data.message : '❌ ' + data.detail);
    } catch (e) {
      notify('Ошибка при отправке уведомления');
    }
  };

  const handleVerify = async (credential = verifyCode) => {
    const verification = typeof credential === 'string'
      ? { code: credential.trim() }
      : credential;
    if (!verification || !/^\d{4,5}$/.test(String(verification.code || '').trim())) {
      notify(t('invalid_qr'));
      return;
    }
    setVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          code: String(verification.code).trim(),
          ...(verification.booking_id ? { booking_id: verification.booking_id } : {}),
        })
      });
      const data = await res.json();
      if (res.ok) {
        setVerifiedStudent(data);
        fetchAdminData();
        notify(`SUCCESS // ${t('entry_allowed')}`);
        setVerifyCode('');
      } else {
        notify(data.detail || t('verification_failed'));
      }
    } catch (e) {
      console.error(e);
      notify(t('verification_failed'));
    } finally {
      setVerifyLoading(false);
    }
  };

  const fetchAdminData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/bookings`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAllBookings(Array.isArray(data) ? data : []);
      } else {
        if (res.status === 401) {
          localStorage.removeItem('user');
          window.location.reload();
          return;
        }
        setAllBookings([]);
      }
    } catch (e) { 
      console.error(e); 
      setAllBookings([]);
    }
    finally { setLoading(false); }
  }, [user.token]);

  useEffect(() => { fetchAdminData(); }, [fetchAdminData]);

  const handleDelete = async (id) => {
    if (!confirm("Confirm deletion?")) return;
    try {
      await fetch(`${API_URL}/admin/bookings/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      notify("SUCCESS // RECORD_DELETED");
      fetchAdminData();
    } catch (e) { console.error(e); }
  };

  const filtered = allBookings.filter(b => {
    const matchesSearch = b.owner_name?.toLowerCase().includes(search.toLowerCase()) || b.date?.includes(search);
    const matchesDorm = filterDorm === 'ALL' ? true : b.dorm_name === filterDorm;
    return matchesSearch && matchesDorm;
  });

  const analyticsBookings = allBookings.filter(b => filterDorm === 'ALL' ? true : b.dorm_name === filterDorm);
  const changeDormFilter = value => {
    setFilterDorm(value);
    setAttendanceQr(null);
  };

  return (
    <div className="p-4 md:p-8 lg:p-16 animate-fade-in bg-white min-h-screen font-mono">
      {/* Header + Verify */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10 items-start">
        <div className="lg:col-span-2">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic mb-2">{t('admin_panel')}</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('admin_subtitle')}</p>
        </div>
        <div className="bg-blue-600 p-6 md:p-8 rounded-[2rem] shadow-[6px_6px_0_#000] text-white">
          <p className="text-[9px] font-black uppercase tracking-widest mb-3 opacity-70">{t('verify_code_title')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength="5"
              placeholder="0000"
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              className="w-full bg-white/10 border-2 border-white/20 p-3 rounded-xl outline-none focus:bg-white/20 transition-all font-black text-2xl tracking-[0.2em] text-center placeholder:text-white/30 text-white"
            />
            <button disabled={verifyLoading} onClick={() => handleVerify()} className="bg-white text-blue-600 p-3 rounded-xl hover:bg-slate-900 hover:text-white transition-all font-black shrink-0 disabled:opacity-50">
              <Check size={20} strokeWidth={4} />
            </button>
          </div>
          <button
            type="button"
            disabled={attendanceQrLoading}
            onClick={generateAttendanceQr}
            className="mt-3 w-full rounded-xl border-2 border-white/30 px-4 py-3 text-xs font-black uppercase tracking-wider transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {attendanceQrLoading ? t('loading') : t('show_attendance_qr')}
          </button>
          {attendanceQr && (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center text-slate-900">
              <AttendanceSessionQr token={attendanceQr.token} label={t('attendance_qr_label')} />
              <p className="text-[9px] font-black uppercase tracking-wider">{t('attendance_qr_caption')}</p>
              <p className="text-[9px] font-black text-blue-600">
                {attendanceQr.scope === 'ALL' ? t('attendance_qr_all_dorms') : attendanceQr.scope}
              </p>
              <p className="text-[9px] font-bold text-slate-500">
                {t('attendance_qr_expires')} {new Date(attendanceQr.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
          {verifiedStudent && (
            <div className="mt-4 p-4 bg-white text-slate-900 rounded-2xl animate-bounce-in border-4 border-slate-900">
              <p className="text-[8px] font-black uppercase text-slate-400 mb-1">{t('student_found')}</p>
              <p className="font-black text-base leading-tight mb-2">{verifiedStudent.fullname}</p>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-600">
                    {verifiedStudent.type === 'shower' ? t('booth') : t('washing_machine')} {verifiedStudent.booth}
                  </p>
                  <p className="text-xs font-black">{verifiedStudent.time}</p>
                </div>
                <div className="px-3 py-1 bg-green-500 text-white text-[10px] font-black rounded-lg">{t('entry_allowed')}</div>
              </div>
              <button onClick={() => setVerifiedStudent(null)} className="w-full mt-3 py-1.5 border-2 border-slate-100 text-[10px] font-black uppercase rounded-lg hover:bg-slate-50">{t('close')}</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b-4 border-slate-900 pb-0 overflow-x-auto scrollbar-none">
        {[
          { key: 'bookings', label: 'Записи', icon: <Filter size={14} /> },
          { key: 'maintenance', label: 'Кабинки', icon: <Wrench size={14} /> },
          { key: 'analytics', label: 'Аналитика', icon: <BarChart3 size={14} /> },
          ...(user.dorm_name === 'UNIT-ALL' ? [
            { key: 'admins', label: 'Коменданты', icon: <Users size={14} /> },
            { key: 'banned', label: 'Блокировки', icon: <ShieldBan size={14} /> },
            { key: 'audit', label: 'Журнал', icon: <History size={14} /> },
          ] : []),
          ...(user.dorm_name === 'UNIT-ALL' || user.can_send_push ? [
            { key: 'announcements', label: 'Объявления', icon: <Megaphone size={14} /> }
          ] : [])
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-6 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-t-2xl border-4 border-b-0 whitespace-nowrap ${activeTab === tab.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-900'
              }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'maintenance' && <MaintenancePanel t={t} user={user} notify={notify} />}
      {activeTab === 'analytics' && (
        <div className="space-y-4 animate-fade-in">
          {showDormFilter && (
            <div className="bg-white border-4 border-slate-900 p-4 rounded-3xl flex items-center justify-between shadow-sm">
              <span className="font-black text-xs uppercase tracking-widest text-slate-400 ml-2">Фильтр:</span>
              <select
                value={filterDorm}
                onChange={e => changeDormFilter(e.target.value)}
                className="bg-slate-50 border-2 border-slate-200 px-4 py-2 rounded-xl font-black text-xs uppercase outline-none focus:ring-2 focus:ring-blue-600/20 cursor-pointer"
              >
                <option value="ALL">Все общежития</option>
                {availableDorms.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          <AnalyticsPanel bookings={analyticsBookings} t={t} />
        </div>
      )}
      {activeTab === 'admins' && user.dorm_name === 'UNIT-ALL' && <AdminsListPanel user={user} notify={notify} t={t} />}
      {activeTab === 'announcements' && (user.dorm_name === 'UNIT-ALL' || user.can_send_push) && <AnnouncementsPanel user={user} notify={notify} />}
      {activeTab === 'banned' && user.dorm_name === 'UNIT-ALL' && <BannedStudentsPanel user={user} notify={notify} />}
      {activeTab === 'audit' && user.dorm_name === 'UNIT-ALL' && <AuditLogsPanel user={user} notify={notify} />}

      {activeTab === 'bookings' && (
        <div className="bg-slate-50 border-4 border-slate-900 p-6 md:p-10 rounded-[3rem] animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter flex items-center gap-3 w-full md:w-auto">
              <Filter className="text-blue-600" /> {t('all_records_title')}
            </h3>
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto items-center">
              {showDormFilter && (
                <select
                  value={filterDorm}
                  onChange={e => changeDormFilter(e.target.value)}
                  className="w-full md:w-auto bg-white border-4 border-slate-900 px-4 py-3.5 rounded-2xl font-black text-xs uppercase outline-none focus:ring-4 focus:ring-blue-600/10 cursor-pointer shadow-sm"
                >
                  <option value="ALL">Все общежития</option>
                  {availableDorms.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border-4 border-slate-900 p-3.5 pl-12 rounded-2xl font-black text-sm outline-none focus:ring-4 focus:ring-blue-600/10 shadow-sm"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  <th className="px-6 text-left pb-4">ID</th>
                  <th className="px-6 text-left pb-4">{t('student_name')}</th>
                  <th className="px-6 text-left pb-4">{t('calendar_selection')}</th>
                  <th className="px-6 text-left pb-4">{t('booth')}</th>
                  <th className="px-6 text-left pb-4">{t('status_label')}</th>
                  <th className="px-6 text-right pb-4">{t('admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} className="bg-white border-2 border-slate-100 hover:shadow-md transition-all group">
                    <td className="px-6 py-5 rounded-l-2xl font-black text-xs text-slate-400">#{b.id}</td>
                    <td className="px-6 py-5">
                      <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{b.owner_name}</p>
                      <p className="text-[9px] font-bold text-blue-600 uppercase mt-0.5">{b.dorm_name} // {b.type === 'shower' ? 'Душ' : b.type === 'laundry' ? 'Стирка' : b.type}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-black text-xs">{b.date}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{b.time}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg">
                        {b.type === 'shower' ? 'S' : 'L'}-0{b.booth}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      {(() => {
                        const timeParts = String(b.time).split(':').map(Number);
                        const [h, m] = timeParts;
                        const bookingTime = new Date(`${b.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
                        const now = new Date();
                        const isPast = now > bookingTime;

                        if (b.is_attended) return (
                          <span className="px-3 py-1 text-[9px] font-black rounded-lg uppercase bg-green-100 text-green-600">
                            {t('status_attended')}
                          </span>
                        );
                        if (isPast) return (
                          <span className="px-3 py-1 text-[9px] font-black rounded-lg uppercase bg-red-100 text-red-600">
                            {t('status_missed')}
                          </span>
                        );
                        return (
                          <span className="px-3 py-1 text-[9px] font-black rounded-lg uppercase bg-orange-100 text-orange-600">
                            {t('status_expected')}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-5 rounded-r-2xl">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSendNotification(b.id)}
                          className="text-blue-500 hover:text-blue-700 p-2 transition-colors"
                          title="Тест push-уведомления"
                        >
                          <Bell size={16} />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600 p-2 transition-colors" title="Удалить запись"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

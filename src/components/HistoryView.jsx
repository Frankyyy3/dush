import { useState, useEffect } from 'react';
import { Calendar, Camera, Clock, MapPin } from 'lucide-react';
import { SectionHeader } from './UI';
import { API_URL } from '../constants';
import { AttendanceQrScanner } from './AttendanceQr';

export const HistoryView = ({ bookings, t, onRefresh, onCancel, notify }) => {
  useEffect(() => { onRefresh(); }, []);
  const [scannerActive, setScannerActive] = useState(false);
  const [attendanceToken, setAttendanceToken] = useState(null);
  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const scanAttendanceQr = async ({ token }) => {
    setScannerActive(false);
    setAttendanceLoading(true);
    try {
      const response = await fetch(`${API_URL}/attendance/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JSON.parse(localStorage.getItem('user')).token}`
        },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) {
        notify(data.detail || t('verification_failed'));
        return;
      }
      setAttendanceToken(token);
      setEligibleBookings(data.bookings || []);
    } catch (error) {
      console.error('Unable to load attendance bookings:', error);
      notify(t('verification_failed'));
    } finally {
      setAttendanceLoading(false);
    }
  };

  const confirmAttendance = async bookingId => {
    setAttendanceLoading(true);
    try {
      const response = await fetch(`${API_URL}/attendance/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JSON.parse(localStorage.getItem('user')).token}`
        },
        body: JSON.stringify({ token: attendanceToken, booking_id: bookingId }),
      });
      const data = await response.json();
      if (!response.ok) {
        notify(data.detail || t('verification_failed'));
        return;
      }
      notify(t('attendance_success'));
      setEligibleBookings(current => current.filter(booking => booking.id !== bookingId));
      await onRefresh();
    } catch (error) {
      console.error('Unable to confirm attendance:', error);
      notify(t('verification_failed'));
    } finally {
      setAttendanceLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-10 lg:p-20 space-y-8 animate-fade-in bg-white font-mono min-h-screen">
      <SectionHeader title={t('history_log')} sub="BOOKING RECORDS_0.1" />

      <section className="rounded-3xl border-4 border-slate-900 bg-blue-600 p-5 text-white shadow-[4px_4px_0_#000]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider">{t('attendance_checkin_title')}</h2>
            <p className="mt-1 text-xs font-bold text-white/75">{t('attendance_checkin_hint')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEligibleBookings([]);
              setAttendanceToken(null);
              setScannerActive(value => !value);
            }}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-white/50 px-4 py-3 text-xs font-black uppercase tracking-wider transition-colors hover:bg-white/10"
          >
            <Camera size={16} />
            {scannerActive ? t('close_scanner') : t('scan_attendance_qr')}
          </button>
        </div>
        <AttendanceQrScanner
          active={scannerActive}
          onScan={scanAttendanceQr}
          onError={key => {
            setScannerActive(false);
            notify(t(key));
          }}
          cameraLabel={t('camera_instructions')}
        />
        {attendanceLoading && <p className="mt-4 text-xs font-black uppercase">{t('loading')}</p>}
        {eligibleBookings.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider">{t('attendance_select_booking')}</p>
            {eligibleBookings.map(booking => (
              <div key={booking.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black uppercase">
                    {booking.type === 'shower' ? t('booth') : t('washing_machine')} {booking.booth}
                  </p>
                  <p className="text-xs font-bold text-slate-500">{booking.date} · {String(booking.time).slice(0, 5)}</p>
                </div>
                <button
                  type="button"
                  disabled={attendanceLoading}
                  onClick={() => confirmAttendance(booking.id)}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {t('mark_attendance')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {bookings.length === 0 ? (
        <div className="h-96 flex flex-col items-center justify-center border-4 border-dashed border-slate-100 rounded-[3rem]">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
            <Calendar size={32} className="text-slate-200" />
          </div>
          <p className="text-slate-300 font-black uppercase tracking-widest text-sm">{t('no_records')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {bookings.map((b, i) => (
            <div
              key={i}
              className="group h-48 md:h-56"
              style={{ perspective: '1000px' }}
            >
              <div className="relative h-full w-full">
                <div
                  className="absolute inset-0 bg-white border-4 border-slate-900 p-5 md:p-6 flex flex-col justify-between rounded-3xl shadow-[4px_4px_0_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#000] transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div className="bg-blue-600 text-white p-2.5 rounded-xl"><Calendar size={18} /></div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{b.id}</p>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">{b.type === 'shower' ? t('booth') : t('laundry')}</p>
                      {b.is_attended && (
                        <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-green-600">{t('status_attended')}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase italic">{b.date}</h4>
                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                      <Clock size={12} className="text-blue-600" />
                      <span className="text-[10px] md:text-xs font-bold uppercase">{String(b.time).slice(0, 5)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-end border-t-2 border-slate-50 pt-4">
                    <div className="flex items-center gap-2">
                      <MapPin size={12} className="text-blue-600" />
                      <span className="text-[10px] md:text-xs font-black uppercase">{b.type === 'shower' ? t('booth') : t('washing_machine')} {b.booth}</span>
                    </div>
                    {(() => {
                      // API возвращает время как "HH:MM:SS" или "HH:MM"
                      const timeParts = String(b.time).split(':').map(Number);
                      const [h, m] = timeParts;
                      const dateStr = String(b.date); // "2026-05-14"
                      const bookingTime = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
                      const now = new Date();
                      const canCancel = (bookingTime - now) > (1000 * 60 * 60);
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canCancel) onCancel(b.id);
                            else notify(t('cancel_too_late'));
                          }}
                          className={`text-[8px] font-black uppercase transition-colors ${canCancel ? 'text-red-400 hover:text-red-600' : 'text-slate-200 cursor-not-allowed'}`}
                        >
                          {t('cancel_record')}
                        </button>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

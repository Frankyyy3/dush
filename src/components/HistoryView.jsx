import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Hash, Trash2 } from 'lucide-react';
import { SectionHeader } from './UI';
import { API_URL } from '../constants';

export const HistoryView = ({ bookings, setActiveView, t, onRefresh, onCancel, notify, user }) => {
  useEffect(() => { onRefresh(); }, []);
  const [flippedIndex, setFlippedIndex] = useState(null);

  return (
    <div className="p-4 md:p-10 lg:p-20 space-y-8 animate-fade-in bg-white font-mono min-h-screen">
      <SectionHeader title={t('history_log')} sub="BOOKING RECORDS_0.1" />

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
              className="group cursor-pointer h-48 md:h-56"
              style={{ perspective: '1000px' }}
              onClick={() => setFlippedIndex(flippedIndex === i ? null : i)}
            >
              <div 
                className="relative w-full h-full transition-all duration-500" 
                style={{ 
                  transformStyle: 'preserve-3d', 
                  transform: flippedIndex === i ? 'rotateY(180deg)' : 'rotateY(0deg)' 
                }}
              >
                {/* Front Side */}
                <div 
                  className="absolute inset-0 bg-white border-4 border-slate-900 p-5 md:p-6 flex flex-col justify-between rounded-3xl shadow-[4px_4px_0_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#000] transition-all"
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <div className="flex justify-between items-start">
                    <div className="bg-blue-600 text-white p-2.5 rounded-xl"><Calendar size={18} /></div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{b.id}</p>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">{b.type === 'shower' ? t('booth') : t('laundry')}</p>
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

                {/* Back Side (CODE) */}
                <div 
                  className="absolute inset-0 bg-blue-600 border-4 border-slate-900 p-5 flex flex-col items-center justify-center rounded-3xl shadow-[4px_4px_0_#000]"
                  style={{ 
                    backfaceVisibility: 'hidden', 
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-4">{t('entry_code_label')}</p>
                  <div className="bg-white border-4 border-slate-900 p-4 rounded-2xl shadow-lg mb-4 w-full text-center">
                    <span className="text-4xl md:text-5xl font-black text-slate-900 tracking-[0.3em]">{b.check_code}</span>
                  </div>
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">{t('verified')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

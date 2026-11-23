export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const dorm = { name: 'Студенческий дом №1', address: 'Университетская 15', booths: 4 };

export const timeSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

export const getWorkingDays = () => {
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const generatedDates = [];
  let cursor = new Date(`${todayStr}T12:00:00Z`);
  while (generatedDates.length < 10) {
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const fullDate = cursor.toISOString().slice(0, 10);
      generatedDates.push({
        d: dayNames[dayOfWeek],
        n: fullDate.slice(8, 10),
        full: fullDate,
        isPast: fullDate < todayStr,
        isToday: fullDate === todayStr
      });
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return generatedDates;
};

export const dates = getWorkingDays();

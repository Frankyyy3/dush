export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const dorm = { name: 'Студенческий дом №1', address: 'Университетская 15', booths: 4 };

export const timeSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

export const getWorkingDays = () => {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentDay = today.getDay();
  let distanceToMonday;

  if (currentDay === 6) {
    distanceToMonday = 2;
  } else if (currentDay === 0) {
    distanceToMonday = 1;
  } else {
    distanceToMonday = 1 - currentDay;
  }

  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);

  const generatedDates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const fullDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    generatedDates.push({
      d: days[i],
      n: String(d.getDate()),
      full: fullDate,
      isPast: d.getTime() !== today.getTime(),
      isToday: d.getTime() === today.getTime()
    });
  }
  return generatedDates;
};

export const dates = getWorkingDays();

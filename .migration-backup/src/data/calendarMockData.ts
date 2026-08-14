import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'

function getDateStr(offset: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = (day === 0 ? 6 : day - 1)
  d.setDate(d.getDate() - diff + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const mockCalendarEvents: MockCalendarEvent[] = [
  // Timed events — Mon (today / offset 0)
  {
    id: 'evt-1',
    title: 'Hommikune jutuaeg',
    startTime: '08:00',
    endTime: '09:00',
    color: '#EDE9FB',
    date: getDateStr(0),
    calendarId: 'mine',
  },
  {
    id: 'evt-3',
    title: 'Treening',
    startTime: '14:00',
    endTime: '15:30',
    color: '#D1FAE5',
    date: getDateStr(0),
    calendarId: 'training',
  },
  {
    id: 'evt-4',
    title: 'Õhtusöök perega',
    startTime: '19:00',
    endTime: '21:00',
    color: '#EDE9FB',
    date: getDateStr(0),
    calendarId: 'family',
  },
  // Tue (offset 1)
  {
    id: 'evt-5',
    title: 'Kohtumine meeskonnaga',
    startTime: '10:00',
    endTime: '11:30',
    color: '#FEE2CC',
    date: getDateStr(1),
    calendarId: 'work',
  },
  {
    id: 'evt-6',
    title: 'Hambarst',
    startTime: '16:00',
    endTime: '17:00',
    color: '#FEE2CC',
    date: getDateStr(1),
    calendarId: 'mine',
  },
  // Wed (offset 2)
  {
    id: 'evt-7',
    title: 'Kool: Matemaatika',
    startTime: '09:00',
    endTime: '10:30',
    color: '#DBEAFE',
    date: getDateStr(2),
    calendarId: 'school',
  },
  {
    id: 'evt-8',
    title: 'Arsti vastuvõtt',
    startTime: '11:00',
    endTime: '12:00',
    color: '#FCE7F3',
    date: getDateStr(2),
    calendarId: 'mine',
  },
  {
    id: 'evt-9',
    title: 'Esitus',
    startTime: '13:30',
    endTime: '14:30',
    color: '#DBEAFE',
    date: getDateStr(2),
    calendarId: 'school',
  },
  // Thu (offset 3)
  {
    id: 'evt-10',
    title: 'Tähtis koosolek',
    startTime: '09:30',
    endTime: '11:00',
    color: '#FEE2CC',
    date: getDateStr(3),
    calendarId: 'work',
  },
  {
    id: 'evt-11',
    title: 'Joogatund',
    startTime: '18:30',
    endTime: '19:30',
    color: '#EDE9FB',
    date: getDateStr(3),
    calendarId: 'training',
  },
  // Fri (offset 4)
  {
    id: 'evt-12',
    title: 'Matk looduses',
    startTime: '10:00',
    endTime: '14:00',
    color: '#D1FAE5',
    date: getDateStr(4),
    calendarId: 'family',
  },
  {
    id: 'evt-13',
    title: 'Perepäev',
    startTime: '11:00',
    endTime: '13:00',
    color: '#FCE7F3',
    date: getDateStr(4),
    calendarId: 'family',
  },
  // All-day spanning event Wed–Sun (offsets 2–6)
  {
    id: 'allday-1',
    title: 'Koolivaheaeg',
    startTime: '00:00',
    endTime: '23:59',
    color: '#CCFBF1',
    date: getDateStr(2),
    allDay: true,
    calendarId: 'school',
  },
  {
    id: 'allday-2',
    title: 'Koolivaheaeg',
    startTime: '00:00',
    endTime: '23:59',
    color: '#CCFBF1',
    date: getDateStr(3),
    allDay: true,
    calendarId: 'school',
  },
  {
    id: 'allday-3',
    title: 'Koolivaheaeg',
    startTime: '00:00',
    endTime: '23:59',
    color: '#CCFBF1',
    date: getDateStr(4),
    allDay: true,
    calendarId: 'school',
  },
  {
    id: 'allday-4',
    title: 'Koolivaheaeg',
    startTime: '00:00',
    endTime: '23:59',
    color: '#CCFBF1',
    date: getDateStr(5),
    allDay: true,
    calendarId: 'school',
  },
  {
    id: 'allday-5',
    title: 'Koolivaheaeg',
    startTime: '00:00',
    endTime: '23:59',
    color: '#CCFBF1',
    date: getDateStr(6),
    allDay: true,
    calendarId: 'school',
  },
]

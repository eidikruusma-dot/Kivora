# Calendar V1 – Desktop UI Reference Locked (Revision 2)

## Status
Complete — desktop UI revised to match reference design as closely as possible.
Build and typecheck pass. Pending user visual confirmation.

## Key Changes from Revision 1

### 1. No-scroll layout (most important)
- Switched from fixed pixel heights to **percentage-based positioning** for events, hour lines, and time labels
- CalendarGrid time area uses `overflow-hidden` (no scroll)
- TimeGrid uses `h-full` and positions events with `top: X%` / `height: X%`
- Full 22-hour range (00:00–22:00) visible at once on desktop
- Only the time grid could scroll if needed; the page itself never scrolls

### 2. CalendarHeader toolbar
- View buttons are now individual bordered buttons (active = purple border + light purple bg)
- "+ Uus" button now has a ChevronDown dropdown arrow
- "Täna" button uses bordered rounded-md style
- Arrows are plain icon buttons

### 3. Calendar grid
- Day headers show **full weekday name** ("Esmaspäev") + **DD.MM date** ("19.05")
- Today's date has purple circle marker
- All-day row shows **spanning bar** ("Koolivaheaeg") across multiple days
- Time labels every 2 hours (00:00–22:00) using percentage positioning
- Hour lines at every hour using percentage positioning
- Purple current-time indicator (dot + line)

### 4. Event cards
- **Time on first line**, **title on second line** (matching reference)
- No left border strip — solid pastel fill
- Smaller corner radius (rounded-md)
- Pastel colors: light purple, light blue, light green, light peach, light pink, teal

### 5. Right sidebar
- Width reduced to 256px (w-64)
- MiniCalendar card (unchanged)
- "Minu kalendrid" card with:
  - **+ button** next to heading
  - Colored checkboxes (Minu kalender, Kool, Töö, Perekond, Treening)
  - **"Peidetud kalendrid"** collapsible section at bottom
- Removed: "Tänased sündmused" card, "Uus ülesanne" button

### 6. Mock data
- Updated event colors to match reference pastels
- Added all-day spanning event ("Koolivaheaeg") for Wed–Sun

## Architecture (unchanged)
Container/Presentational pattern — no architecture changes.

## Files Modified
- src/lib/calendar/eventLayout.ts — fraction-based positioning, allDay filter
- src/data/calendarMockData.ts — pastel colors, all-day spanning events
- src/components/calendar/CalendarHeader.tsx — bordered view buttons, +Uus with chevron
- src/components/calendar/CalendarGrid.tsx — full weekday names, DD.MM dates, spanning all-day row, % time labels, overflow-hidden
- src/components/calendar/TimeGrid.tsx — % event positioning, h-full, purple time line
- src/components/calendar/DayColumn.tsx — h-full propagation
- src/components/calendar/EventCard.tsx — time-first layout, no left strip, rounded-md
- src/components/calendar/MyCalendars.tsx — + button, Peidetud kalendrid section
- src/components/calendar/RightSidebar.tsx — width w-64
- src/views/CalendarPage.tsx — padding adjustment

## Verification
- npm run build: PASS (12.37s, 0 errors)
- npx tsc --noEmit: PASS (0 errors)

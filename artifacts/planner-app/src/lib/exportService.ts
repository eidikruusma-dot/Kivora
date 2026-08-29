/**
 * exportService.ts
 *
 * Real browser-side data export.
 * Reads live data from Firestore, generates a PDF or .xlsx file,
 * and triggers a browser download.
 *
 * Supported collections:
 *   tasks    → users/{uid}/tasks
 *   calendar → users/{uid}/calendarEvents
 *   habits   → users/{uid}/habits
 *   goals    → users/{uid}/goals
 *   notes    → users/{uid}/notes
 *   school   → users/{uid}/schoolItems
 *
 * Only the caller-supplied selectedKeys are fetched and included.
 * No authentication secrets, tokens, backups, or other users' data are exported.
 */

import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { AppLang } from '@/lib/languageStore'

// ── Public types ──────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'xlsx'

export type DataKey =
  | 'tasks'
  | 'calendar'
  | 'habits'
  | 'goals'
  | 'notes'
  | 'school'

// ── Firestore collection names ────────────────────────────────────────────────

const FS_COL: Record<DataKey, string> = {
  tasks:    'tasks',
  calendar: 'calendarEvents',
  habits:   'habits',
  goals:    'goals',
  notes:    'notes',
  school:   'schoolItems',
}

// ── Section labels ────────────────────────────────────────────────────────────

const SECTION_LABEL: Record<DataKey, Record<AppLang, string>> = {
  tasks:    { et: 'Ülesanded',  en: 'Tasks' },
  calendar: { et: 'Kalender',   en: 'Calendar' },
  habits:   { et: 'Harjumused', en: 'Habits' },
  goals:    { et: 'Eesmärgid',  en: 'Goals' },
  notes:    { et: 'Märkmed',    en: 'Notes' },
  school:   { et: 'Kool',       en: 'School' },
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const s = (v: unknown): string =>
  v != null && String(v).trim() !== '' ? String(v) : '–'

const b = (v: unknown): string =>
  v === true || v === 'true' ? '✓' : '–'

const progress = (row: Row): string => {
  const v = row.progressValue, m = row.progressMax
  return typeof v === 'number' && typeof m === 'number' && m > 0
    ? `${v}/${m} (${Math.round((v / m) * 100)}%)`
    : '–'
}

// ── Column definitions ────────────────────────────────────────────────────────

interface Col {
  headerEt: string
  headerEn: string
  get: (row: Row) => string
}

const COLS: Record<DataKey, Col[]> = {
  tasks: [
    { headerEt: 'Pealkiri',   headerEn: 'Title',       get: r => s(r.title) },
    { headerEt: 'Prioriteet', headerEn: 'Priority',    get: r => s(r.priority) },
    { headerEt: 'Olek',       headerEn: 'Status',      get: r => r.completed === true ? 'Tehtud' : 'Tegemata' },
    { headerEt: 'Kuupäev',    headerEn: 'Date',        get: r => s(r.date) },
    { headerEt: 'Kellaaeg',   headerEn: 'Time',        get: r => s(r.time) },
    { headerEt: 'Kategooria', headerEn: 'Category',    get: r => s(r.category) },
    { headerEt: 'Kirjeldus',  headerEn: 'Description', get: r => s(r.description) },
  ],
  calendar: [
    { headerEt: 'Pealkiri',   headerEn: 'Title',       get: r => s(r.title) },
    { headerEt: 'Kuupäev',    headerEn: 'Date',        get: r => s(r.date) },
    { headerEt: 'Algus',      headerEn: 'Start',       get: r => s(r.startTime) },
    { headerEt: 'Lõpp',       headerEn: 'End',         get: r => s(r.endTime) },
    { headerEt: 'Terve päev', headerEn: 'All day',     get: r => b(r.allDay) },
    { headerEt: 'Kirjeldus',  headerEn: 'Description', get: r => s(r.description) },
  ],
  habits: [
    { headerEt: 'Pealkiri',   headerEn: 'Title',       get: r => s(r.title) },
    { headerEt: 'Kategooria', headerEn: 'Category',    get: r => s(r.category) },
    { headerEt: 'Kirjeldus',  headerEn: 'Description', get: r => s(r.description) },
  ],
  goals: [
    { headerEt: 'Pealkiri',  headerEn: 'Title',       get: r => s(r.title) },
    { headerEt: 'Olek',      headerEn: 'Status',      get: r => s(r.status) },
    { headerEt: 'Tähtaeg',   headerEn: 'Deadline',    get: r => s(r.deadlineShort ?? r.deadline) },
    { headerEt: 'Edusammud', headerEn: 'Progress',    get: r => progress(r) },
    { headerEt: 'Kirjeldus', headerEn: 'Description', get: r => s(r.description) },
  ],
  notes: [
    { headerEt: 'Pealkiri', headerEn: 'Title',    get: r => s(r.title) },
    { headerEt: 'Kaust',    headerEn: 'Folder',   get: r => s(r.folder) },
    { headerEt: 'Tärnitud', headerEn: 'Starred',  get: r => b(r.starred) },
    { headerEt: 'Sisu',     headerEn: 'Content',  get: r => s(r.preview ?? r.content) },
  ],
  school: [
    { headerEt: 'Liik',     headerEn: 'Type',        get: r => s(r.kind) },
    { headerEt: 'Pealkiri', headerEn: 'Title',        get: r => s(r.title ?? r.name) },
    { headerEt: 'Aine',     headerEn: 'Subject',      get: r => s(r.subject) },
    { headerEt: 'Kuupäev',  headerEn: 'Date',         get: r => s(r.date ?? r.deadline) },
    { headerEt: 'Olek',     headerEn: 'Status',       get: r => s(r.status) },
    { headerEt: 'Edu %',    headerEn: 'Progress %',   get: r => r.progress != null ? String(r.progress) : '–' },
  ],
}

// ── Firestore fetch ───────────────────────────────────────────────────────────

async function fetchData(uid: string, keys: DataKey[]): Promise<Map<DataKey, Row[]>> {
  const entries = await Promise.all(
    keys.map(async (key): Promise<[DataKey, Row[]]> => {
      try {
        const snap = await getDocs(collection(db, 'users', uid, FS_COL[key]))
        return [key, snap.docs.map(d => d.data() as Row)]
      } catch {
        // Collection may not exist yet for this user; treat as empty.
        return [key, []]
      }
    }),
  )
  return new Map(entries)
}

// ── Browser download trigger ──────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

// ── PDF generation ────────────────────────────────────────────────────────────

function buildPDF(
  data: Map<DataKey, Row[]>,
  keys: DataKey[],
  lang: AppLang,
  dateStr: string,
): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = doc.internal.pageSize.getWidth()
  const PAGE_H = doc.internal.pageSize.getHeight()
  const PURPLE: [number, number, number] = [111, 90, 232]
  const PURPLE_LIGHT: [number, number, number] = [237, 233, 251]
  const GRAY: [number, number, number] = [148, 163, 184]
  const ROW_ALT: [number, number, number] = [248, 247, 255]

  // ── Cover header (page 1 only) ────────────────────────────────────────────
  doc.setFillColor(...PURPLE)
  doc.rect(0, 0, PAGE_W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('Kivora', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const subtitle = lang === 'et' ? 'Andmete eksport' : 'Data Export'
  doc.text(subtitle, 14, 18)
  doc.text(dateStr, PAGE_W - 14, 18, { align: 'right' })

  let cursorY = 32

  const addPageHeader = () => {
    doc.setFillColor(...PURPLE)
    doc.rect(0, 0, PAGE_W, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`Kivora Export  •  ${dateStr}`, 14, 7)
  }

  const addPageFooter = (pageNum: number) => {
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.setFont('helvetica', 'normal')
    doc.text(String(pageNum), PAGE_W - 14, PAGE_H - 5, { align: 'right' })
  }

  for (const key of keys) {
    const rows = data.get(key) ?? []
    const cols = COLS[key]
    const label = SECTION_LABEL[key][lang]
    const countLabel = lang === 'et' ? `${rows.length} kirjet` : `${rows.length} items`

    // New page if not enough room for heading + at least one data row
    if (cursorY > 255) {
      doc.addPage()
      addPageHeader()
      cursorY = 16
    }

    // Section heading pill
    doc.setFillColor(...PURPLE_LIGHT)
    doc.roundedRect(14, cursorY, PAGE_W - 28, 9, 2, 2, 'F')
    doc.setTextColor(...PURPLE)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(label, 18, cursorY + 6)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(countLabel, PAGE_W - 16, cursorY + 6, { align: 'right' })
    cursorY += 12

    if (rows.length === 0) {
      doc.setTextColor(...GRAY)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      const empty = lang === 'et' ? 'Andmed puuduvad' : 'No data found'
      doc.text(empty, 18, cursorY + 4)
      cursorY += 10
      continue
    }

    const head = [cols.map(c => lang === 'et' ? c.headerEt : c.headerEn)]
    const body = rows.map(row => cols.map(c => c.get(row)))

    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        overflow: 'linebreak',
        valign: 'top',
        textColor: [26, 31, 54],
      },
      headStyles: {
        fillColor: PURPLE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      didDrawPage: (d) => {
        if (d.pageNumber > 1) {
          addPageHeader()
        }
        addPageFooter(d.pageNumber)
      },
    })

    cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 10
  }

  return doc.output('blob')
}

// ── Excel generation ──────────────────────────────────────────────────────────

function buildXLSX(
  data: Map<DataKey, Row[]>,
  keys: DataKey[],
  lang: AppLang,
): Blob {
  const wb = XLSX.utils.book_new()

  for (const key of keys) {
    const rows = data.get(key) ?? []
    const cols = COLS[key]
    // Excel sheet names: max 31 chars, no special chars
    const sheetName = SECTION_LABEL[key][lang].slice(0, 31)

    const header = cols.map(c => (lang === 'et' ? c.headerEt : c.headerEn))
    const body   = rows.map(row => cols.map(c => c.get(row)))

    const ws = XLSX.utils.aoa_to_sheet([header, ...body])

    // Auto-width: max of header length vs longest data cell, capped at 50
    ws['!cols'] = cols.map((_, i) => {
      const hLen = header[i].length
      const dLen = body.reduce(
        (mx, r) => Math.max(mx, String(r[i] ?? '').length),
        0,
      )
      return { wch: Math.min(Math.max(hLen, dLen) + 2, 50) }
    })

    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Read live Firestore data for each key in `selectedKeys`, generate a file
 * in the given format, and trigger a browser download.
 *
 * Throws on Firestore or generation failure — callers must not show success
 * before this resolves.
 */
export async function runExport(
  uid: string,
  format: ExportFormat,
  selectedKeys: DataKey[],
  lang: AppLang,
): Promise<void> {
  if (selectedKeys.length === 0) return

  const data    = await fetchData(uid, selectedKeys)
  const dateStr = new Date().toISOString().split('T')[0]
  const filename = `kivora-export-${dateStr}.${format}`

  const blob =
    format === 'pdf'
      ? buildPDF(data, selectedKeys, lang, dateStr)
      : buildXLSX(data, selectedKeys, lang)

  triggerDownload(blob, filename)
}

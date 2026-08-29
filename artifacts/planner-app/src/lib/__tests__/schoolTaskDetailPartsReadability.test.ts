/**
 * School task detail readability fix — the task-parts (Ülesande osad) rows
 * inside TaskDetailModal were too dense: long part text couldn't wrap
 * comfortably and the checkbox was vertically centered against the whole
 * (potentially multi-line) label instead of its first line.
 *
 * Scope: only the read-only task-parts row rendering inside TaskDetailModal
 * (the `task.parts!.map(...)` block). The editable TaskPartsEditor used by
 * the add/edit forms, and every other section of the detail modal, are
 * untouched.
 *
 * No render harness exists for SchoolPage.tsx in this repo — verified via
 * structural regex assertions against the raw source, matching the pattern
 * used throughout this session's other School tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskDetailPartsReadability.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

const DETAIL_BLOCK =
  SCHOOL_PAGE_SRC.match(/function TaskDetailModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''

const ROW_BLOCK =
  DETAIL_BLOCK.match(/\{task\.parts!\.map\(\(part\) => \([\s\S]*?\)\)\}/)?.[0] ?? ''

describe('TaskDetailModal task-part row: readability fix', () => {
  it('the row block was actually found (sanity check on the regex slice)', () => {
    expect(ROW_BLOCK.length).toBeGreaterThan(0)
    expect(ROW_BLOCK).toMatch(/onTogglePart/)
  })

  it('the row aligns items to the start (top), not centered, so the checkbox tracks the first line', () => {
    expect(ROW_BLOCK).toMatch(/<label[^>]*className="flex items-start /)
    expect(ROW_BLOCK).not.toMatch(/<label[^>]*className="flex items-center /)
  })

  it('the checkbox button gets a small top margin to line up with the first text line', () => {
    expect(ROW_BLOCK).toMatch(/className=\{`mt-0\.5 w-5 h-5 rounded-md border-2/)
  })

  it('row padding increased slightly (py-2 -> py-2.5)', () => {
    expect(ROW_BLOCK).toMatch(/px-3 py-2\.5 rounded-lg/)
    expect(ROW_BLOCK).not.toMatch(/px-3 py-2 rounded-lg/)
  })

  it('the text span can wrap onto multiple lines: no truncate/nowrap, has break-words and takes the remaining row width', () => {
    expect(ROW_BLOCK).toMatch(/flex-1 min-w-0 text-sm leading-snug break-words/)
    expect(ROW_BLOCK).not.toMatch(/truncate/)
    expect(ROW_BLOCK).not.toMatch(/whitespace-nowrap/)
    expect(ROW_BLOCK).not.toMatch(/overflow-hidden/)
    expect(ROW_BLOCK).not.toMatch(/text-ellipsis/)
  })

  it('the full part text (or the fallback "Part N" label) is still rendered verbatim — no slicing/substring', () => {
    expect(ROW_BLOCK).toMatch(/\{part\.label \|\|\s*\n\s*tr\("school\.task\.parts\.partN", lang\)\.replace\(/)
    expect(ROW_BLOCK).not.toMatch(/\.slice\(/)
    expect(ROW_BLOCK).not.toMatch(/\.substring\(/)
  })

  it('the checkbox onClick/onTogglePart wiring and progress display are untouched', () => {
    expect(ROW_BLOCK).toMatch(/onClick=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onTogglePart\(task\.id, part\.id\);/)
    expect(ROW_BLOCK).toMatch(/part\.done\s*\?\s*"bg-\[#6F5AE8\] border-\[#6F5AE8\] text-white"/)
  })

  it('the parts-completed count header (X/Y ...) above the rows is unchanged', () => {
    expect(DETAIL_BLOCK).toMatch(/\{partsDone\}\/\{partsTotal\}\{" "\}/)
  })
})

describe('Scope: nothing else in the row wrapper/header or the rest of the modal changed', () => {
  it('the parts list wrapper (flex-col gap between rows) is unchanged', () => {
    expect(DETAIL_BLOCK).toMatch(/<div className="flex flex-col gap-1\.5">\s*\{task\.parts!\.map/)
  })

  it('the editable TaskPartsEditor (add/edit forms) still uses its own separate JSX, not this row markup', () => {
    const editorMatches = SCHOOL_PAGE_SRC.match(/function TaskPartsEditor/g) ?? []
    expect(editorMatches.length).toBe(1)
    const editorBlock =
      SCHOOL_PAGE_SRC.match(/function TaskPartsEditor\([\s\S]*?\n}\n/)?.[0] ?? ''
    expect(editorBlock).not.toMatch(/mt-0\.5 w-5 h-5 rounded-md border-2/)
  })

  it('the modal max-width from the earlier widening change is untouched', () => {
    expect(DETAIL_BLOCK).toMatch(/w-full max-w-md md:max-w-2xl bg-white rounded-2xl shadow-xl/)
  })

  it('the moreOpen collapsible section from the previous UX-cleanup round is untouched', () => {
    expect(DETAIL_BLOCK).toMatch(/const \[moreOpen, setMoreOpen\] = useState\(false\)/)
    expect(DETAIL_BLOCK).toMatch(/tr\("school\.section\.more", lang\)/)
  })

  it('web links rendering is untouched', () => {
    expect(DETAIL_BLOCK).toMatch(/webLinks\.length > 0 && \(/)
  })
})

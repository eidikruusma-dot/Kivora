import { useState, useEffect } from 'react'
import type { Goal, GoalStep } from '@/data/goalsData'
import { mockGoals } from '@/data/goalsData'

type Listener = (goals: Goal[]) => void

let goals: Goal[] = [...mockGoals]
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(goals)
}

function recompute(goal: Goal): Goal {
  const done = goal.steps.filter((s) => s.done).length
  const total = goal.steps.length
  const status = total > 0 && done >= total ? 'completed' : goal.status === 'completed' && done < total ? 'active' : goal.status
  return { ...goal, progressValue: done, progressMax: Math.max(total, 1) }
}

export function getAllGoals(): Goal[] {
  return goals
}

export function addGoal(goal: Goal) {
  goals = [...goals, recompute(goal)]
  emit()
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  goals = goals.map((g) => (g.id === id ? recompute({ ...g, ...patch }) : g))
  emit()
}

export function toggleStep(goalId: string, stepId: string) {
  goals = goals.map((g) => {
    if (g.id !== goalId) return g
    const steps = g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
    return recompute({ ...g, steps })
  })
  emit()
}

export function addStep(goalId: string, title: string) {
  goals = goals.map((g) => {
    if (g.id !== goalId) return g
    const step: GoalStep = { id: `step-${Date.now()}`, title, done: false }
    return recompute({ ...g, steps: [...g.steps, step] })
  })
  emit()
}

export function deleteStep(goalId: string, stepId: string) {
  goals = goals.map((g) => {
    if (g.id !== goalId) return g
    return recompute({ ...g, steps: g.steps.filter((s) => s.id !== stepId) })
  })
  emit()
}

export function deleteGoal(id: string) {
  goals = goals.filter((g) => g.id !== id)
  emit()
}

export function useGoals(): Goal[] {
  const [state, setState] = useState<Goal[]>(goals)
  useEffect(() => {
    const l: Listener = (g) => setState(g)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}

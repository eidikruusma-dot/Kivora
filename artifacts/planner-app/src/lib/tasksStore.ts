import { useState, useEffect, useCallback } from 'react'
import type { Task } from '@/types'
import { mockTasks } from '@/data/mockData'

type Listener = (tasks: Task[]) => void

let tasks: Task[] = [...mockTasks]
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(tasks)
}

export function getAllTasks(): Task[] {
  return tasks
}

export function addTask(task: Task) {
  tasks = [task, ...tasks]
  emit()
}

export function toggleTask(id: string) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
  emit()
}

export function deleteTask(id: string) {
  tasks = tasks.filter((t) => t.id !== id)
  emit()
}

export function updateTask(updated: Task) {
  tasks = tasks.map((t) => (t.id === updated.id ? updated : t))
  emit()
}

export function useTasks(): Task[] {
  const [state, setState] = useState<Task[]>(tasks)
  useEffect(() => {
    const l: Listener = (t) => setState(t)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}

export function useTaskActions() {
  return {
    addTask: useCallback((task: Task) => addTask(task), []),
    toggleTask: useCallback((id: string) => toggleTask(id), []),
    deleteTask: useCallback((id: string) => deleteTask(id), []),
  }
}

import { UtensilsCrossed, Dumbbell, BookOpen, Brush, Heart, Plus, type LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/translations'

export type PlanTemplateType = 'menu' | 'workout' | 'study' | 'cleaning' | 'selfcare' | 'blank'

/** One default checklist item a template pre-fills a new plan with. */
export interface PlanItemBlueprint {
  /** Stable, template-scoped slug — combined with the template type to form the created PlanItem's id. */
  id: string
  titleKey: TranslationKey
}

export interface PlanTemplate {
  type: PlanTemplateType
  icon: LucideIcon
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  accentColor: string
  accentBg: string
  /** Pre-selected color for a plan created from this template. */
  defaultColor: string
  itemBlueprints: PlanItemBlueprint[]
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    type: 'menu',
    icon: UtensilsCrossed,
    titleKey: 'plans.template.menu.title',
    descriptionKey: 'plans.template.menu.desc',
    accentColor: '#6F5AE8',
    accentBg: '#EDE9FB',
    defaultColor: '#6F5AE8',
    itemBlueprints: [
      { id: 'monday', titleKey: 'plans.item.menu.monday' },
      { id: 'tuesday', titleKey: 'plans.item.menu.tuesday' },
      { id: 'wednesday', titleKey: 'plans.item.menu.wednesday' },
      { id: 'thursday', titleKey: 'plans.item.menu.thursday' },
      { id: 'friday', titleKey: 'plans.item.menu.friday' },
      { id: 'saturday', titleKey: 'plans.item.menu.saturday' },
      { id: 'sunday', titleKey: 'plans.item.menu.sunday' },
    ],
  },
  {
    type: 'workout',
    icon: Dumbbell,
    titleKey: 'plans.template.workout.title',
    descriptionKey: 'plans.template.workout.desc',
    accentColor: '#2563EB',
    accentBg: '#DBEAFE',
    defaultColor: '#2563EB',
    itemBlueprints: [
      { id: '1', titleKey: 'plans.item.workout.1' },
      { id: '2', titleKey: 'plans.item.workout.2' },
      { id: '3', titleKey: 'plans.item.workout.3' },
    ],
  },
  {
    type: 'study',
    icon: BookOpen,
    titleKey: 'plans.template.study.title',
    descriptionKey: 'plans.template.study.desc',
    accentColor: '#16A34A',
    accentBg: '#DCFCE7',
    defaultColor: '#16A34A',
    itemBlueprints: [
      { id: '1', titleKey: 'plans.item.study.1' },
      { id: '2', titleKey: 'plans.item.study.2' },
      { id: '3', titleKey: 'plans.item.study.3' },
      { id: '4', titleKey: 'plans.item.study.4' },
      { id: '5', titleKey: 'plans.item.study.5' },
    ],
  },
  {
    type: 'cleaning',
    icon: Brush,
    titleKey: 'plans.template.cleaning.title',
    descriptionKey: 'plans.template.cleaning.desc',
    accentColor: '#EA580C',
    accentBg: '#FFF7ED',
    defaultColor: '#F97316',
    itemBlueprints: [
      { id: 'kitchen', titleKey: 'plans.item.cleaning.kitchen' },
      { id: 'livingRoom', titleKey: 'plans.item.cleaning.livingRoom' },
      { id: 'bathroom', titleKey: 'plans.item.cleaning.bathroom' },
      { id: 'bedroom', titleKey: 'plans.item.cleaning.bedroom' },
    ],
  },
  {
    type: 'selfcare',
    icon: Heart,
    titleKey: 'plans.template.selfcare.title',
    descriptionKey: 'plans.template.selfcare.desc',
    accentColor: '#DC2626',
    accentBg: '#FEE2E2',
    defaultColor: '#DC2626',
    itemBlueprints: [
      { id: 'morning', titleKey: 'plans.item.selfcare.morning' },
      { id: 'movement', titleKey: 'plans.item.selfcare.movement' },
      { id: 'rest', titleKey: 'plans.item.selfcare.rest' },
      { id: 'evening', titleKey: 'plans.item.selfcare.evening' },
    ],
  },
  {
    type: 'blank',
    icon: Plus,
    titleKey: 'plans.template.blank.title',
    descriptionKey: 'plans.template.blank.desc',
    accentColor: '#64748B',
    accentBg: '#F1F5F9',
    defaultColor: '#6F5AE8',
    itemBlueprints: [],
  },
]

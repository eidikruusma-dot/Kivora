import { UtensilsCrossed, Dumbbell, BookOpen, Brush, Heart, Plus, type LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/translations'

export type PlanTemplateType = 'menu' | 'workout' | 'study' | 'cleaning' | 'selfcare' | 'blank'

export interface PlanTemplate {
  type: PlanTemplateType
  icon: LucideIcon
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  accentColor: string
  accentBg: string
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    type: 'menu',
    icon: UtensilsCrossed,
    titleKey: 'plans.template.menu.title',
    descriptionKey: 'plans.template.menu.desc',
    accentColor: '#6F5AE8',
    accentBg: '#EDE9FB',
  },
  {
    type: 'workout',
    icon: Dumbbell,
    titleKey: 'plans.template.workout.title',
    descriptionKey: 'plans.template.workout.desc',
    accentColor: '#2563EB',
    accentBg: '#DBEAFE',
  },
  {
    type: 'study',
    icon: BookOpen,
    titleKey: 'plans.template.study.title',
    descriptionKey: 'plans.template.study.desc',
    accentColor: '#16A34A',
    accentBg: '#DCFCE7',
  },
  {
    type: 'cleaning',
    icon: Brush,
    titleKey: 'plans.template.cleaning.title',
    descriptionKey: 'plans.template.cleaning.desc',
    accentColor: '#EA580C',
    accentBg: '#FFF7ED',
  },
  {
    type: 'selfcare',
    icon: Heart,
    titleKey: 'plans.template.selfcare.title',
    descriptionKey: 'plans.template.selfcare.desc',
    accentColor: '#DC2626',
    accentBg: '#FEE2E2',
  },
  {
    type: 'blank',
    icon: Plus,
    titleKey: 'plans.template.blank.title',
    descriptionKey: 'plans.template.blank.desc',
    accentColor: '#64748B',
    accentBg: '#F1F5F9',
  },
]

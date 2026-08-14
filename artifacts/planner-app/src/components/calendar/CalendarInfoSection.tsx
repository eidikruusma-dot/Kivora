import {
  Check,
  Minus,
  Lock,
  User,
  Bell,
  CheckSquare,
  Target,
  Users,
} from 'lucide-react'

const PURPLE = '#6F5AE8'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-white flex flex-col"
      style={{
        border: '1px solid #ECECF2',
        borderRadius: '12px',
        padding: '22px',
        minHeight: '300px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1F36', marginBottom: '16px', lineHeight: 1.3 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <Check size={14} strokeWidth={2.5} style={{ color: PURPLE, flexShrink: 0, marginTop: '2px' }} />
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.55 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function StoryList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <Minus size={12} strokeWidth={2.5} style={{ color: PURPLE, flexShrink: 0, marginTop: '3px' }} />
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.55 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span style={{ fontSize: '14px', color: '#1A1F36', flexShrink: 0, marginTop: '-1px', lineHeight: 1.55 }}>•</span>
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.55 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

const DEP_ICONS: { label: string; icon: React.ElementType; color: string; note: string }[] = [
  { label: 'Authentication', icon: Lock,         color: '#22C55E', note: 'olemas' },
  { label: 'User Profile',   icon: User,         color: '#22C55E', note: 'olemas' },
  { label: 'Notifications',  icon: Bell,         color: '#F59E0B', note: 'tulevikus' },
  { label: 'Tasks',          icon: CheckSquare,  color: '#6F5AE8', note: 'tulevikus, seos päevakavaga' },
  { label: 'Goals',          icon: Target,       color: '#F97316', note: 'tulevikus, seos tähtajaga' },
  { label: 'Family',         icon: Users,        color: '#3B82F6', note: 'tulevikus, perekalendrid' },
]

function DepsCard() {
  return (
    <SectionCard title="Sõltuvused">
      <ul className="flex flex-col gap-3">
        {DEP_ICONS.map(({ label, icon: Icon, color, note }) => (
          <li key={label} className="flex items-start gap-2.5">
            <Icon size={15} strokeWidth={2} style={{ color, flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '13px', color: '#374151', lineHeight: 1.55 }}>
              <span style={{ fontWeight: 500 }}>{label}</span>
              <span style={{ color: '#94A3B8' }}> ({note})</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

export default function CalendarInfoSection() {
  return (
    <div style={{ marginTop: '16px', padding: '0 0 32px 0' }}>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]"
        style={{ gap: '14px' }}
      >
        <SectionCard title="Põhifunktsioonid MVP (V1)">
          <FeatureList items={[
            'Päeva-, nädala- ja kuuvaated',
            'Sündmuste loomine ja haldamine',
            'Mitme kalendri tugi (värvikoodid)',
            'Sündmuse kategooriad/kalendrid',
            'Täna nupp ja kiire navigeerimine',
            'Sündmuse kordus (põhivalikud)',
            'Otsing sündmuste sees',
            'Responsiivne (desktop + mobile)',
          ]} />
        </SectionCard>

        <SectionCard title="Kasutuslood MVP">
          <StoryList items={[
            'Kasutaja näeb oma sündmusi päeva-, nädala- või kuuvaates.',
            'Kasutaja loob uue sündmuse.',
            'Kasutaja redigeerib või kustutab sündmuse.',
            'Kasutaja lisab sündmusele kordumise.',
            'Kasutaja filtreerib kalendreid.',
          ]} />
        </SectionCard>

        <SectionCard title="Jäetakse hilisemasse (V2+)">
          <BulletList items={[
            'Sündmuste jagamine teistega',
            'Kutsed ja osalejad',
            'Täpsed õigused kalendritele',
            'Aruanded ajakasutuse kohta',
            'Sündmuse asukoha kaart',
            'AI-põhine ajasoovitav assistent',
            'Integratsioon Google/Outlook kalendriga',
          ]} />
        </SectionCard>

        <DepsCard />
      </div>
    </div>
  )
}

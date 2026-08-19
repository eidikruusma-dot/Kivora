import { Toaster as Sonner } from 'sonner'
import { useIsDark } from '@/lib/themeColors'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const isDark = useIsDark()
  return (
    <Sonner
      theme={isDark ? 'dark' : 'light'}
      className="toaster group"
      {...props}
    />
  )
}

export { Toaster }

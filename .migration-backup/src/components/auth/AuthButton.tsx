import { type ButtonHTMLAttributes } from 'react'

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export default function AuthButton({ variant = 'primary', className = '', children, ...props }: AuthButtonProps) {
  const base = 'w-full h-[52px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150'
  const styles = variant === 'primary'
    ? 'bg-[#6F5AE8] text-white hover:bg-[#5B4AD5] hover:shadow-md hover:shadow-[#6F5AE8]/25'
    : 'bg-white border border-[#E8E6E0] text-[#1A1F36] hover:bg-[#F8F7F4]'

  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  )
}

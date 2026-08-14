import { type InputHTMLAttributes, forwardRef } from 'react'

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div>
        <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">{label}</label>
        <input
          ref={ref}
          className={`w-full h-[52px] px-3.5 text-sm bg-[#F8F7F4] border rounded-xl text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors ${
            error ? 'border-red-400' : 'border-[#E8E6E0]'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }
)

AuthInput.displayName = 'AuthInput'

export default AuthInput

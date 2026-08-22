import { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  primary?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}

export default function Button({
  children,
  primary = false,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} ${className}`.trim()}
    >
      {children}
    </button>
  )
}

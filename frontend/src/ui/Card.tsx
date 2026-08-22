import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  selected?: boolean
}

export default function Card({ children, className = '', onClick, selected }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      onClick={onClick}
      className={`card ${selected ? 'card-selected' : ''} ${onClick ? 'card-clickable' : ''} ${className}`
        .replace(/\s+/g, ' ')
        .trim()}
    >
      {children}
    </div>
  )
}

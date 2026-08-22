interface BadgeProps {
  children: React.ReactNode
  variant?: 'accent' | 'green' | 'yellow' | 'orange' | 'red' | 'neutral'
}

export default function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

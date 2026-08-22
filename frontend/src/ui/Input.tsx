interface InputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  label?: string
  id?: string
  className?: string
  /** id of an element describing the field, announced after the label. */
  describedBy?: string
}

export default function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  label,
  id,
  className = '',
  describedBy,
}: InputProps) {
  const inputId = id || `input-${Math.random().toString(36).slice(2)}`
  return (
    <div className={`field ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className="field-input"
      />
    </div>
  )
}

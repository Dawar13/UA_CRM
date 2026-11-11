import { Eye, EyeOff } from 'lucide-react'
import { type ComponentPropsWithRef, useState } from 'react'
import { cn } from '@/lib/cn'

/** Shared field chrome for Input and Textarea. */
export const fieldClassName = cn(
  'w-full min-w-0 rounded-control border border-border bg-surface-raised text-base text-text',
  'placeholder:text-muted',
  'transition-[border-color,box-shadow] duration-(--duration-fast) ease-out',
  'hover:border-border-strong/70',
  'focus-visible:border-focus',
  'aria-invalid:border-cold aria-invalid:focus-visible:outline-cold',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted disabled:opacity-70 disabled:hover:border-border',
)

export type InputProps = ComponentPropsWithRef<'input'>

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type ?? 'text'}
      className={cn(fieldClassName, 'h-8 px-2.5', className)}
      {...props}
    />
  )
}

/**
 * A password field with an eye button inside its right end that shows or hides what was typed.
 * The browser's own reveal button (Edge) is hidden so there is only one.
 */
export function PasswordInput({ className, ...props }: Omit<InputProps, 'type'>) {
  const [shown, setShown] = useState(false)
  const label = shown ? 'Hide password' : 'Show password'
  return (
    <div className="relative">
      <Input
        type={shown ? 'text' : 'password'}
        className={cn('pr-9 [&::-ms-reveal]:hidden', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={label}
        aria-pressed={shown}
        title={label}
        onClick={() => setShown((s) => !s)}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-control text-muted transition-colors duration-(--duration-fast) ease-out hover:text-text disabled:pointer-events-none"
      >
        {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  )
}

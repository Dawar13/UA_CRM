import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { type ThemeMode, themeModeLabels, themeModes, useTheme } from '@/app/theme'
import { IconButton, type IconButtonProps } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'

const themeIcons: Record<ThemeMode, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

/** Header button that cycles system → light → dark. Its icon and tooltip name the current mode. */
export function ThemeToggle({
  className,
  variant,
  size,
}: {
  className?: string
  variant?: IconButtonProps['variant']
  size?: IconButtonProps['size']
}) {
  const { mode, cycleMode } = useTheme()
  const Icon = themeIcons[mode]
  const label = `Theme: ${themeModeLabels[mode]}`
  return (
    <IconButton
      aria-label={label}
      tooltip={label}
      data-mode={mode}
      onClick={cycleMode}
      variant={variant}
      size={size}
      className={className}
    >
      <Icon aria-hidden="true" />
    </IconButton>
  )
}

/**
 * Segmented System / Light / Dark control (a radio group), for menus and settings. Same shape as
 * the member switch: a soft well with the checked option raised on paper.
 */
export function ThemeSegmented({ className }: { className?: string }) {
  const { mode, setMode } = useTheme()
  return (
    <RadioGroup.Root
      aria-label="Theme"
      orientation="horizontal"
      value={mode}
      onValueChange={(next) => {
        const found = themeModes.find((m) => m === next)
        if (found) setMode(found)
      }}
      className={cn(
        'inline-flex h-[34px] items-center gap-0.5 rounded-[8px] bg-surface-hover p-[3px]',
        className,
      )}
    >
      {themeModes.map((m) => {
        const Icon = themeIcons[m]
        return (
          <RadioGroup.Item
            key={m}
            value={m}
            className={cn(
              'inline-flex h-full cursor-default items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-secondary',
              'transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-out',
              'hover:text-text',
              'data-[state=checked]:bg-bg data-[state=checked]:text-text data-[state=checked]:shadow-[0_1px_2px_var(--shadow),0_0_0_1px_var(--border)]',
              '[&_svg]:size-3.5 [&_svg]:shrink-0',
            )}
          >
            <Icon aria-hidden="true" />
            {themeModeLabels[m]}
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}

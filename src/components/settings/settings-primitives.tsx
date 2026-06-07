import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PickerIcon } from "@/components/chat/picker-icon"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

// ---------------------------------------------------------------------------
// Tab & section headings
// ---------------------------------------------------------------------------

export function SettingsTabHeader({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <header className={className}>
      <h2 className="text-base font-semibold leading-tight tracking-tight">
        {title}
      </h2>
      {description && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  )
}

export function SectionHeading({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={className}>
      <h3 className="text-sm font-semibold leading-none">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <SectionHeading title={title} description={description} />
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Grouped rows
// ---------------------------------------------------------------------------

export function SettingsGroup({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background divide-y divide-border",
        className
      )}
    >
      {children}
    </div>
  )
}

export function SettingsRow({
  title,
  description,
  control,
  className,
}: {
  title: string
  description?: string
  control: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-2.5 py-2",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export function SettingsSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  icon: Icon,
  iconSrc,
}: {
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: React.ComponentType<{ className?: string }>
  iconSrc?: string
}) {
  const showLeading = Boolean(Icon || iconSrc)

  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {showLeading ? (
          <div className="flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 p-1">
            {iconSrc ? (
              <PickerIcon src={iconSrc} className="size-3.5" />
            ) : Icon ? (
              <Icon className="size-3.5 text-muted-foreground" />
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{title}</div>
          {description ? (
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  )
}

export function SettingsCheckboxRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Icon cards (toggle / checkbox)
// ---------------------------------------------------------------------------

function SettingsIconCardBody({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  control: React.ReactNode
}) {
  return (
    <>
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="rounded-md border border-border bg-muted/40 p-1">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{title}</div>
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </>
  )
}

const settingsIconCardClassName =
  "flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-2.5 py-2"

export function SettingsToggle({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <div className={cn(settingsIconCardClassName, className)}>
      <SettingsIconCardBody
        icon={Icon}
        title={title}
        description={description}
        control={
          <Switch checked={checked} onCheckedChange={onCheckedChange} />
        }
      />
    </div>
  )
}

export function SettingsCheckbox({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  if (!Icon) {
    return (
      <SettingsCheckboxRow
        title={title}
        description={description}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    )
  }

  return (
    <label className={cn(settingsIconCardClassName, "cursor-pointer", className)}>
      <SettingsIconCardBody
        icon={Icon}
        title={title}
        description={description}
        control={
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
        }
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export type SettingsSegmentedOption<T extends string> = {
  value: T
  label?: string
  icon?: React.ComponentType<{ className?: string }>
  preview?: string
}

const segmentedSizeStyles = {
  sm: {
    button:
      "gap-1 px-2 py-0.5 text-xs rounded-[min(var(--radius-md),10px)]",
    icon: "size-3",
  },
  default: {
    button: "gap-1.5 px-2.5 py-1 text-xs rounded-md",
    icon: "size-3.5",
  },
  lg: {
    button: "gap-2 px-3 py-1.5 text-sm rounded-md",
    icon: "size-4",
  },
} as const

export function SettingsSegmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SettingsSegmentedOption<T>[]
  size?: keyof typeof segmentedSizeStyles
  className?: string
}) {
  const sizeStyle = segmentedSizeStyles[size]

  return (
    <div
      className={cn(
        "flex flex-wrap",
        size === "sm" ? "gap-0.5" : "gap-1",
        className
      )}
      role="group"
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center border font-medium transition-colors",
              sizeStyle.button,
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {option.icon && (
              <option.icon className={cn("shrink-0", sizeStyle.icon)} />
            )}
            {option.preview != null ? (
              <span className="font-mono">{option.preview}</span>
            ) : (
              option.label
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export function SettingsRange({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-background px-2.5 py-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium leading-tight">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <div className="py-1.5">
        <Slider
          min={min}
          max={max}
          step={1}
          value={[value]}
          onValueChange={(values) => onChange(values[0] ?? min)}
        />
      </div>
    </div>
  )
}

export function SettingsSliderRow({
  title,
  description,
  value,
  valueLabel,
  onChange,
  min,
  max,
}: {
  title: string
  description?: string
  value: number
  valueLabel?: React.ReactNode
  onChange: (value: number) => void
  min: number
  max: number
}) {
  return (
    <div className="px-2.5 py-2">
      <div className="flex items-start justify-between gap-2 text-sm">
        <div className="min-w-0">
          <span className="font-medium leading-tight">{title}</span>
          {description ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <span className="text-xs tabular-nums text-muted-foreground">
            {valueLabel ?? value}
          </span>
        </div>
      </div>
      <div className="pt-3 pb-2">
        <Slider
          min={min}
          max={max}
          step={1}
          value={[value]}
          onValueChange={(values) => onChange(values[0] ?? min)}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Select / text fields
// ---------------------------------------------------------------------------

export function SettingsField({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div>
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

export function SettingsSelectRow<T extends string>({
  title,
  description,
  value,
  onChange,
  options,
  placeholder,
}: {
  title: string
  description?: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  placeholder?: string
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      control={
        <Select value={value} onValueChange={(next) => onChange(next as T)}>
          <SelectTrigger size="sm" className="min-w-[7.5rem]">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent align="end">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

export function SettingsInputRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = "text",
  onBlur,
  onKeyDown,
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: React.HTMLInputTypeAttribute
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div className="space-y-1.5 px-2.5 py-2">
      <div>
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

export function SettingsTextareaRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div className="space-y-1.5 px-2.5 py-2">
      <div>
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actions & callouts
// ---------------------------------------------------------------------------

export function SettingsActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>
  )
}

export function SettingsActionButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button size="sm" className={cn("h-7", className)} {...props}>
      {children}
    </Button>
  )
}

type SettingsChipProps = {
  children: React.ReactNode
  className?: string
  href?: string
  onClick?: React.MouseEventHandler<HTMLElement>
}

export function SettingsChip({
  children,
  className,
  href,
  onClick,
}: SettingsChipProps) {
  const baseClass = cn(
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
    className
  )

  if (href) {
    return (
      <a href={href} onClick={onClick} className={baseClass}>
        {children}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn(baseClass, "cursor-pointer")}>
      {children}
    </button>
  )
}

export function SettingsChipPrimary({
  children,
  className,
  href,
  onClick,
}: SettingsChipProps) {
  const baseClass = cn(
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    "bg-primary/10 text-primary hover:bg-primary/20",
    className
  )

  if (href) {
    return (
      <a href={href} onClick={onClick} className={baseClass}>
        {children}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn(baseClass, "cursor-pointer")}>
      {children}
    </button>
  )
}

export function SettingsCallout({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground",
        className
      )}
    >
      {title && (
        <div className="mb-1 text-sm font-medium text-foreground">{title}</div>
      )}
      {children}
    </div>
  )
}

export function SettingsDivider({ className }: { className?: string }) {
  return <Separator className={cn("my-0 mt-6 mb-4", className)} />
}

export function SettingsTab({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("pb-2", className)}>
      <SettingsTabHeader title={title} description={description} />
      <div className="mt-5 space-y-6">{children}</div>
    </div>
  )
}

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

interface Props {
  value: string
  onChange(value: string): void
  onComplete?(value: string): void
  disabled?: boolean
  autoFocus?: boolean
}

/** 6-digit Kode 2FA (TOTP) input. */
export function CodeInput({ value, onChange, onComplete, disabled, autoFocus = true }: Props) {
  return (
    <InputOTP
      maxLength={6}
      inputMode="numeric"
      pattern="^[0-9]*$"
      autoComplete="one-time-code"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label="2FA code"
    >
      <InputOTPGroup>
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

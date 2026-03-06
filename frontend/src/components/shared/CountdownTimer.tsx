import { useCallback, useEffect, useState } from 'react'

interface CountdownTimerProps {
  deadline: bigint
  onComplete?: () => void
}

export function CountdownTimer({ deadline, onComplete }: CountdownTimerProps) {
  const calculateTimeLeft = useCallback(() => {
    if (deadline === 0n) return null
    
    const now = BigInt(Math.floor(Date.now() / 1000))
    const diff = deadline - now
    
    if (diff <= 0n) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
    
    return {
      days: Number(diff / 86400n),
      hours: Number((diff % 86400n) / 3600n),
      minutes: Number((diff % 3600n) / 60n),
      seconds: Number(diff % 60n),
      expired: false,
    }
  }, [deadline])

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft)

  useEffect(() => {
    const timer = setInterval(() => {
      const left = calculateTimeLeft()
      setTimeLeft(left)
      if (left?.expired) {
        clearInterval(timer)
        onComplete?.()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [calculateTimeLeft, onComplete])

  if (!timeLeft) return <span className="text-[var(--color-text-dim)]">N/A</span>
  
  if (timeLeft.expired) return <span className="text-error">EXPIRED</span>

  const isWarning = timeLeft.days === 0 && timeLeft.hours < 1

  return (
    <div className={`countdown-timer ${isWarning ? 'warning' : ''}`}>
      {timeLeft.days > 0 && (
        <div className="countdown-segment">
          <span className="countdown-value">{timeLeft.days}</span>
          <span className="countdown-label">Days</span>
        </div>
      )}
      <div className="countdown-segment">
        <span className="countdown-value">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="countdown-label">Hrs</span>
      </div>
      <div className="countdown-segment">
        <span className="countdown-value">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="countdown-label">Min</span>
      </div>
      <div className="countdown-segment">
        <span className="countdown-value">{String(timeLeft.seconds).padStart(2, '0')}</span>
        <span className="countdown-label">Sec</span>
      </div>
    </div>
  )
}

import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'

interface AnimatedStatCardProps {
  label: string
  value: string | number
  subValue?: string
  color?: string
  delay?: number
}

export function AnimatedStatCard({
  label,
  value,
  subValue,
  color = 'var(--color-primary)',
  delay = 0
}: AnimatedStatCardProps) {
  const colorClass = color === 'var(--color-primary)' ? 'text-primary' :
                     color === 'var(--color-secondary)' ? 'text-secondary' :
                     color === 'var(--color-warning)' ? 'text-[var(--color-warning)]' :
                     color === 'var(--color-error)' ? 'text-error' :
                     color === 'var(--color-text)' ? 'text-[var(--color-text)]' :
                     'text-primary';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay,
        ease: 'linear'
      }}
    >
      <Card
        className="bg-gradient-to-br from-[var(--color-bg-panel)] to-[var(--color-bg)] border-[var(--color-bg-light)] hover:border-[var(--color-primary)] transition-colors duration-200"
      >
        <div className="text-center p-6">
          <div className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-dim)] mb-2">
            {label}
          </div>
          <div
            className={`font-mono text-3xl font-bold ${colorClass}`}
          >
            {value}
          </div>
          {subValue && (
            <div className="font-mono text-sm text-[var(--color-text-dim)] mt-1">
              {subValue}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

export function AnimatedStatCardGrid({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={`grid grid-cols-2 md:grid-cols-4 gap-6 ${className}`}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.1
          }
        }
      }}
    >
      {children}
    </motion.div>
  )
}

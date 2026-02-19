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
  color = '#00ff9d',
  delay = 0
}: AnimatedStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.4, 0, 0.2, 1]
      }}
    >
      <motion.div
        whileHover={{
          scale: 1.03,
          boxShadow: `0 0 30px ${color}25, 0 0 60px ${color}10`
        }}
        whileTap={{ scale: 0.98 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 20
        }}
      >
        <Card
          className="relative overflow-hidden bg-gradient-to-br from-[rgba(17,17,17,0.9)] to-[rgba(10,10,10,0.95)] border-[var(--color-bg-light)] hover:border-[var(--color-primary)] transition-colors duration-200"
        >
          <motion.div
            className="absolute inset-0 opacity-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${color}15 0%, transparent 70%)`
            }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />

          <div className="relative z-10 text-center p-6">
            <div className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-dim)] mb-2">
              {label}
            </div>
            <motion.div
              className="font-display text-3xl font-bold"
              style={{ color }}
              whileHover={{
                textShadow: `0 0 20px ${color}60, 0 0 40px ${color}30`
              }}
            >
              {value}
            </motion.div>
            {subValue && (
              <div className="font-mono text-sm text-[var(--color-text-dim)] mt-1">
                {subValue}
              </div>
            )}
          </div>

          <motion.div
            className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, ${color}10 0%, transparent 50%)`
            }}
            whileHover={{
              opacity: [0.5, 1, 0.5],
              transition: { duration: 1, repeat: Infinity }
            }}
          />
        </Card>
      </motion.div>
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

'use client'

import { motion } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'
import { staggerContainer, staggerChild } from '@/lib/animations'

const steps = [
  {
    step: '01',
    title: 'SUBMIT_POC',
    icon: '↑',
    desc: 'Upload proof-of-concept exploit.',
  },
  {
    step: '02',
    title: 'CRE_VERIFIES',
    icon: '◈',
    desc: 'Decentralized nodes validate hash.',
  },
  {
    step: '03',
    title: 'SIMULATION',
    icon: '⚙',
    desc: 'Tenderly sandbox executes attack.',
  },
  {
    step: '04',
    title: 'PAYOUT',
    icon: '$',
    desc: 'Smart contract releases bounty.',
  },
]

export const HowItWorks: React.FC = () => {
  return (
    <section className="py-24 px-4 border-t border-[var(--color-text-dim)]">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center text-[var(--color-text-dim)] text-sm tracking-[0.3em] uppercase mb-16"
      >
        System Architecture
      </motion.h2>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px' }}
        className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {steps.map((step, idx) => (
          <motion.div key={step.step} variants={staggerChild} className="relative group">
            {idx < steps.length - 1 && (
              <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-[var(--color-primary)] to-transparent opacity-40 z-10" />
            )}

            <Card className="relative overflow-hidden bg-[#0a0a0f] border-[var(--color-text-dim)]/20 hover:border-[var(--color-primary)]/30 transition-all duration-300 h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="absolute top-4 right-4 text-[10px] font-mono text-[var(--color-text-dim)]/50">
                {step.step}
              </div>

              <CardContent className="p-6 flex flex-col items-center text-center">
                <motion.div
                  className="text-4xl mb-4 text-[var(--color-primary)]"
                  style={{ textShadow: '0 0 20px var(--color-primary-dim)' }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {step.icon}
                </motion.div>

                <h3 className="font-mono text-sm tracking-wider text-[var(--color-text)] mb-3">
                  {step.title}
                </h3>

                <p className="text-[var(--color-text-dim)] text-xs leading-relaxed">
                  {step.desc}
                </p>
              </CardContent>

              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-primary)]/30 to-transparent" />
            </Card>

            {idx < steps.length - 1 && (
              <div className="lg:hidden flex justify-center py-2">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="text-[var(--color-primary)]/50"
                >
                  ↓
                </motion.div>
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      <div className="max-w-6xl mx-auto mt-16 flex justify-center gap-2">
        {steps.map((_, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + idx * 0.08 }}
            className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]/30"
          />
        ))}
      </div>
    </section>
  )
}

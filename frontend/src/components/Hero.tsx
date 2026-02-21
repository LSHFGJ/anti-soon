import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { staggerContainer, staggerChild } from '@/lib/animations'

export const Hero: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="container relative min-h-[80vh] flex flex-col justify-center items-start py-20 overflow-hidden">
      <div 
        className="hero-grid-bg absolute inset-0 -z-10 opacity-10 pointer-events-none"
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="w-full max-w-3xl"
      >
        <motion.div variants={staggerChild} className="mb-8">
          <motion.h1
            className="font-mono text-primary tracking-[0.1em] text-[clamp(2.5rem,10vw,5rem)] font-bold leading-none mb-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { 
                opacity: 1,
                transition: { duration: 0.1 }
              },
            }}
          >
            <motion.span
              className="relative inline-block"
              animate={shouldReduceMotion ? undefined : { x: [0, -1, 1, 0] }}
              transition={
                shouldReduceMotion
                  ? undefined
                  : {
                      duration: 0.15,
                      times: [0, 0.33, 0.66, 1],
                      repeat: Infinity,
                      repeatDelay: 5,
                    }
              }
            >
              ANTI-SOON
            </motion.span>
          </motion.h1>
          <motion.div 
            className="bg-secondary h-0.5 w-24"
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.2, ease: 'linear' }}
          />
        </motion.div>

        <motion.h2
          variants={staggerChild}
          className="font-mono text-[var(--color-text)] text-xl md:text-2xl mb-6"
        >
          No more soon.{' '}
          <span className="text-secondary">Verify now.</span>{' '}
          <span className="text-primary">Get paid now.</span>
        </motion.h2>

        <motion.p
          variants={staggerChild}
          className="font-mono text-[var(--color-text-dim)] max-w-xl mb-8 leading-relaxed"
        >
          Decentralized vulnerability verification powered by Chainlink CRE. 
          Submit a PoC, get it verified by decentralized nodes, receive bounty instantly.
          <br />
          <span 
            className="text-secondary inline-block mt-2"
          >
            &gt; System Status: ONLINE
          </span>
        </motion.p>

        <motion.div 
          variants={staggerChild}
          className="flex flex-wrap gap-4"
        >
          <Button
            asChild
            size="lg"
            className="font-mono relative overflow-hidden border border-[var(--color-primary)] bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] uppercase tracking-wider px-8 transition-all duration-200"
          >
            <Link to="/builder">Submit PoC</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="font-mono border border-[var(--color-text-dim)] bg-transparent text-[var(--color-text-dim)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] uppercase tracking-wider px-8 transition-all duration-200"
          >
            <Link to="/explorer">View Bounties</Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  )
}

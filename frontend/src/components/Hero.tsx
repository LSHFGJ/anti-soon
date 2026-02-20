import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { staggerContainer, staggerChild } from '@/lib/animations'

export const Hero: React.FC = () => {
  return (
    <section className="container relative min-h-[80vh] flex flex-col justify-center items-start py-20 overflow-hidden">
      <div 
        className="absolute inset-0 -z-10 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="w-full max-w-3xl"
      >
        <motion.div variants={staggerChild} className="mb-8">
          <motion.h1
            className="text-[clamp(2.5rem,10vw,5rem)] font-bold leading-none mb-4"
            style={{ 
              fontFamily: 'var(--font-display)',
              color: 'var(--color-primary)',
              letterSpacing: '0.1em',
            }}
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
              animate={{
                x: [0, -1, 1, 0],
              }}
              transition={{
                duration: 0.15,
                times: [0, 0.33, 0.66, 1],
                repeat: Infinity,
                repeatDelay: 5,
              }}
            >
              ANTI-SOON
            </motion.span>
          </motion.h1>
          <motion.div 
            className="h-0.5 w-24"
            style={{ background: 'var(--color-secondary)' }}
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
          />
        </motion.div>

        <motion.h2
          variants={staggerChild}
          className="text-xl md:text-2xl mb-6"
          style={{ 
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text)',
          }}
        >
          No more soon.{' '}
          <span style={{ color: 'var(--color-secondary)' }}>Verify now.</span>{' '}
          <span style={{ color: 'var(--color-primary)' }}>Get paid now.</span>
        </motion.h2>

        <motion.p
          variants={staggerChild}
          className="max-w-xl mb-8 leading-relaxed"
          style={{ 
            color: 'var(--color-text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Decentralized vulnerability verification powered by Chainlink CRE. 
          Submit a PoC, get it verified by decentralized nodes, receive bounty instantly.
          <br />
          <span 
            className="inline-block mt-2"
            style={{ color: 'var(--color-secondary)' }}
          >
            &gt; System Status: ONLINE
          </span>
        </motion.p>

        <motion.div 
          variants={staggerChild}
          className="flex flex-wrap gap-4"
        >
          <Button
            size="lg"
            className="relative overflow-hidden border border-[var(--color-primary)] bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)] font-mono uppercase tracking-wider px-8 transition-all duration-200"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            Submit PoC
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="border border-[var(--color-text-dim)] bg-transparent text-[var(--color-text-dim)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] font-mono uppercase tracking-wider px-8 transition-all duration-200"
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            View Bounties
          </Button>
        </motion.div>
      </motion.div>
    </section>
  )
}

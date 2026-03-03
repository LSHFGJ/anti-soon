import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { staggerContainer, staggerChild } from '@/lib/animations'

export const Hero: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()
  const channels = ['Announcement', 'Project', 'Discussion']
  const memeRows = [
    { user: 'Alice', text: 'wen', ts: '12:00' },
    { user: 'Bob', text: 'wen the result', ts: '12:00' },
    { user: 'Charlie', text: '🔜', ts: '12:00' },
  ]

  return (
    <section className="container relative min-h-[80vh] flex flex-col justify-center items-start py-20 overflow-hidden">
      <div 
        className="hero-grid-bg absolute inset-0 -z-10 opacity-10 pointer-events-none"
      />

      <div className="w-full flex items-stretch justify-between gap-10 xl:gap-16">
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
              <img
                src="/logo/antisoon-logo-horizontal.svg"
                alt="AntiSoon"
                className="h-[clamp(2.5rem,10vw,5rem)] w-auto"
                loading="eager"
                decoding="async"
              />
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

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35, duration: 0.3, ease: 'easeOut' }}
          className="hidden lg:flex lg:w-[520px] xl:w-[580px] shrink-0 lg:self-stretch lg:-ml-[100px]"
          aria-label="meme-chat-panel"
        >
          <Card className="w-full h-full overflow-hidden border-[#3a3d44] bg-[#1e1f22]/95 shadow-[0_0_30px_rgba(88,101,242,0.22)]">
            <div className="h-full flex flex-col">
              <div className="h-9 border-b border-white/10 bg-[#2b2d31] px-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#9ca3af]" aria-hidden="true" />
                <span className="w-10" aria-hidden="true" />
              </div>

              <div className="flex-1 min-h-0 flex overflow-hidden">
                <aside className="w-14 bg-[#1a1b1e] border-r border-white/5 px-2 py-3 space-y-2.5">
                  <div className="relative">
                    <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-white/90" aria-hidden="true" />
                    <div className="h-9 w-9 mx-auto rounded-2xl bg-[#5865f2] text-white text-sm font-mono flex items-center justify-center">A</div>
                  </div>
                  <div className="h-px w-8 mx-auto bg-white/10" />
                  <div className="h-9 w-9 mx-auto rounded-full bg-white/10 text-[#d1d5db] text-xs font-mono flex items-center justify-center">B</div>
                  <div className="h-9 w-9 mx-auto rounded-full bg-white/10 text-[#d1d5db] text-xs font-mono flex items-center justify-center">C</div>
                  <div className="h-9 w-9 mx-auto rounded-full bg-white/10 text-[#d1d5db] text-xs font-mono flex items-center justify-center">+</div>
                </aside>

                <aside className="w-40 bg-[#2b2d31] border-r border-white/5 p-3 flex flex-col">
                  <div className="h-8 -mx-3 -mt-3 mb-3 px-3 border-b border-white/10 text-[#f2f3f5] text-xs font-mono flex items-center">
                    AntiSoon
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[#949ba4] mb-1 font-mono">text channels</div>
                  <div className="space-y-1 text-xs font-mono text-[#b5bac1]">
                    {channels.map((channel, idx) => (
                      <div
                        key={channel}
                        className={`rounded px-2 py-1 transition-colors ${
                          idx === 0 ? 'bg-[#404249] text-[#dbdee1]' : 'hover:bg-white/5'
                        }`}
                      >
                        # {channel}
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto -mx-3 -mb-3 px-3 py-2 border-t border-white/10 flex items-center gap-2.5 bg-[#232428]">
                    <span className="h-7 w-7 rounded-full bg-[#5865f2]/70 border border-[#8088ff]/50 p-1.5" aria-hidden="true">
                      <img src="/logo/antisoon-logo-icon.svg" alt="" className="h-full w-full object-contain" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-[#f2f3f5] truncate">anti-soon-bot</div>
                      <div className="font-mono text-[10px] text-[#949ba4]">online</div>
                    </div>
                  </div>
                </aside>

                <div className="flex-1 min-w-0 bg-[#313338] flex flex-col">
                  <header className="h-10 px-3 border-b border-white/5 flex items-center justify-between text-xs font-mono text-[#b5bac1]">
                    <span className="text-[#f2f3f5]"># Announcement</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/20 text-[10px] text-[#949ba4]">search</span>
                  </header>

                  <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.08em] text-[#949ba4]">
                      <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                      <span>new messages</span>
                      <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                    </div>

                    {memeRows.map((row, idx) => (
                      <div key={`${row.text}-${idx}`} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 h-7 w-7 rounded-full bg-white/10 border border-white/15 text-[#dbdee1] text-[11px] flex items-center justify-center"
                          aria-hidden="true"
                        >
                          👤
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-xs text-[#dbdee1]">{row.user}</span>
                            <span className="font-mono text-[10px] text-[#949ba4]">{row.ts}</span>
                          </div>
                          <p className="font-mono text-sm text-[#e5e7eb]">{row.text}</p>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-start gap-2.5 bg-[rgba(88,101,242,0.14)] border-l-2 border-[#5865f2] -mx-3 px-3 py-1.5">
                      <span className="mt-0.5 h-7 w-7 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/50 p-1.5" aria-hidden="true">
                        <img src="/logo/antisoon-logo-icon.svg" alt="" className="h-full w-full object-contain" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-[#dbdee1]">anti-soon-bot</span>
                          <span className="font-mono text-[10px] text-[#949ba4]">12:01</span>
                        </div>
                        <p className="font-mono text-sm text-[#e5e7eb]">now</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-3">
                    <div className="relative">
                      <Input
                        readOnly
                        value=""
                        className="h-9 bg-[#383a40] border-white/10 text-[#949ba4] font-mono text-xs pr-16"
                        aria-label="Discord-like message composer preview"
                      />
                      <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[#b5bac1] text-sm">+</span>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b5bac1] text-sm">@</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.aside>
      </div>
    </section>
  )
}

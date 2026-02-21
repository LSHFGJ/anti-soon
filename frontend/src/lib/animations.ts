/**
 * Motion Animation Variants for AntiSoon
 * 
 * Hybrid approach:
 * - Motion for interactive animations (hover, entry, transitions)
 * - CSS keyframes for infinite loops (pulse, glow, scanlines)
 * 
 * Usage:
 * ```tsx
 * import { motion } from 'motion/react'
 * import { fadeIn, slideUp } from '@/lib/animations'
 * 
 * <motion.div variants={fadeIn} initial="hidden" animate="visible">
 *   Content
 * </motion.div>
 * ```
 */

import type { Variants } from 'motion/react'

/**
 * Fade in animation - simple opacity entrance
 */
export const fadeIn: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: 'linear',
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
}

/**
 * Slide up with fade - classic entrance animation
 */
export const slideUp: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'linear', // ease-out-cubic
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
}

/**
 * Cyberpunk glitch effect - digital distortion
 * Best for headers, important text, or error states
 */
export const glitch: Variants = {
  hidden: {
    opacity: 0,
    x: 0,
    filter: 'blur(0px)',
  },
  visible: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.1,
    },
  },
  glitching: {
    x: [0, -2, 2, -1, 1, 0],
    opacity: [1, 0.8, 1, 0.9, 1],
    filter: ['blur(0px)', 'blur(1px)', 'blur(0px)', 'blur(2px)', 'blur(0px)'],
    transition: {
      duration: 0.3,
      times: [0, 0.2, 0.4, 0.6, 1],
      repeat: Infinity,
      repeatDelay: 3,
    },
  },
  exit: {
    opacity: 0,
    filter: 'blur(4px)',
    transition: {
      duration: 0.15,
    },
  },
}

/**
 * Neon glow pulse - subtle breathing effect
 * Best for buttons, highlights, active states
 */
export const glow: Variants = {
  initial: {
    boxShadow: '0 0 0px rgba(124, 58, 237, 0)',
  },
  hover: {
    boxShadow: '0 0 20px rgba(124, 58, 237, 0.5), 0 0 40px rgba(124, 58, 237, 0.3)',
    transition: {
      duration: 0.3,
      ease: 'linear',
    },
  },
  tap: {
    boxShadow: '0 0 10px rgba(124, 58, 237, 0.3)',
    transition: {
      duration: 0.1,
    },
  },
  active: {
    boxShadow: [
      '0 0 10px rgba(124, 58, 237, 0.3)',
      '0 0 20px rgba(124, 58, 237, 0.5)',
      '0 0 10px rgba(124, 58, 237, 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
}

/**
 * Stagger container - for animating lists of children
 * Use with staggerChild for individual items
 */
export const staggerContainer: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
}

/**
 * Stagger child - individual item animation for stagger containers
 */
export const staggerChild: Variants = {
  hidden: {
    opacity: 0,
    y: 15,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'linear',
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: {
      duration: 0.2,
    },
  },
}

/**
 * Scale pop - for modals, dialogs, tooltips
 */
export const scalePop: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.15,
      ease: 'linear',
    },
  },
}

/**
 * Slide from side - for sidebars, drawers
 */
export const slideFromLeft: Variants = {
  hidden: {
    x: '-100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
}

export const slideFromRight: Variants = {
  hidden: {
    x: '100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'linear',
    },
  },
}

/**
 * Typewriter effect - for code/terminal text
 */
export const typewriter: Variants = {
  hidden: {
    width: 0,
    opacity: 0,
  },
  visible: {
    width: '100%',
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: 'linear',
    },
  },
}

/**
 * Page transition - for route changes
 */
export const pageTransition: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'linear',
      when: 'beforeChildren',
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
}

/**
 * Linear config presets (formerly spring)
 */
export const motionConfigs = {
  // Snappy, quick response
  snappy: { duration: 0.1, ease: 'linear' as const },
  // Smooth, gentle
  smooth: { duration: 0.3, ease: 'linear' as const },
  // Bouncy, playful (now linear)
  bouncy: { duration: 0.2, ease: 'linear' as const },
  // Stiff, precise
  stiff: { duration: 0.15, ease: 'linear' as const },
}

/**
 * Common transition presets
 */
export const transitions = {
  fast: { duration: 0.15, ease: 'linear' as const },
  normal: { duration: 0.3, ease: 'linear' },
  slow: { duration: 0.5, ease: 'linear' },
}

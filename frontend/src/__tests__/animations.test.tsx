import { describe, it, expect } from 'vitest'
import {
  fadeIn,
  slideUp,
  glitch,
  glow,
  staggerContainer,
  staggerChild,
  scalePop,
  slideFromLeft,
  slideFromRight,
  typewriter,
  pageTransition,
  springConfigs,
  transitions,
} from '@/lib/animations'
import type { Variants } from 'motion/react'

// Type helper for accessing variant properties
type VariantTarget = Record<string, unknown>

describe('Motion Animation Variants', () => {
  describe('fadeIn', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(fadeIn).toHaveProperty('hidden')
      expect(fadeIn).toHaveProperty('visible')
      expect(fadeIn).toHaveProperty('exit')
    })

    it('should have opacity transition', () => {
      expect((fadeIn.hidden as VariantTarget).opacity).toBe(0)
      expect((fadeIn.visible as VariantTarget).opacity).toBe(1)
      expect((fadeIn.exit as VariantTarget).opacity).toBe(0)
    })

    it('should have transition config in visible state', () => {
      expect((fadeIn.visible as VariantTarget).transition).toBeDefined()
    })
  })

  describe('slideUp', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(slideUp).toHaveProperty('hidden')
      expect(slideUp).toHaveProperty('visible')
      expect(slideUp).toHaveProperty('exit')
    })

    it('should include y translation', () => {
      expect((slideUp.hidden as VariantTarget).y).toBe(20)
      expect((slideUp.visible as VariantTarget).y).toBe(0)
    })

    it('should have opacity transition', () => {
      expect((slideUp.hidden as VariantTarget).opacity).toBe(0)
      expect((slideUp.visible as VariantTarget).opacity).toBe(1)
    })
  })

  describe('glitch', () => {
    it('should have hidden, visible, glitching, and exit states', () => {
      expect(glitch).toHaveProperty('hidden')
      expect(glitch).toHaveProperty('visible')
      expect(glitch).toHaveProperty('glitching')
      expect(glitch).toHaveProperty('exit')
    })

    it('should have filter effects for blur', () => {
      expect((glitch.hidden as VariantTarget).filter).toBeDefined()
      expect((glitch.visible as VariantTarget).filter).toBeDefined()
      expect((glitch.exit as VariantTarget).filter).toBeDefined()
    })

    it('should have glitching state with x offset array', () => {
      const glitchingX = (glitch.glitching as VariantTarget).x
      expect(Array.isArray(glitchingX)).toBe(true)
    })

    it('should have infinite repeat in glitching transition', () => {
      const transition = (glitch.glitching as VariantTarget).transition as VariantTarget
      expect(transition.repeat).toBe(Infinity)
    })
  })

  describe('glow', () => {
    it('should have initial, hover, tap, and active states', () => {
      expect(glow).toHaveProperty('initial')
      expect(glow).toHaveProperty('hover')
      expect(glow).toHaveProperty('tap')
      expect(glow).toHaveProperty('active')
    })

    it('should have boxShadow in all states', () => {
      expect((glow.initial as VariantTarget).boxShadow).toBeDefined()
      expect((glow.hover as VariantTarget).boxShadow).toBeDefined()
      expect((glow.tap as VariantTarget).boxShadow).toBeDefined()
      expect((glow.active as VariantTarget).boxShadow).toBeDefined()
    })

    it('should use neon green color in boxShadow', () => {
      const boxShadow = (glow.hover as VariantTarget).boxShadow as string
      expect(boxShadow).toContain('rgba(0, 255, 157')
    })

    it('should have infinite repeat in active transition', () => {
      const transition = (glow.active as VariantTarget).transition as VariantTarget
      expect(transition.repeat).toBe(Infinity)
    })
  })

  describe('staggerContainer', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(staggerContainer).toHaveProperty('hidden')
      expect(staggerContainer).toHaveProperty('visible')
      expect(staggerContainer).toHaveProperty('exit')
    })

    it('should have staggerChildren in visible transition', () => {
      const transition = (staggerContainer.visible as VariantTarget).transition as VariantTarget
      expect(transition.staggerChildren).toBeDefined()
      expect(transition.staggerChildren).toBe(0.08)
    })

    it('should have delayChildren in visible transition', () => {
      const transition = (staggerContainer.visible as VariantTarget).transition as VariantTarget
      expect(transition.delayChildren).toBeDefined()
      expect(transition.delayChildren).toBe(0.1)
    })
  })

  describe('staggerChild', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(staggerChild).toHaveProperty('hidden')
      expect(staggerChild).toHaveProperty('visible')
      expect(staggerChild).toHaveProperty('exit')
    })

    it('should include y translation', () => {
      expect((staggerChild.hidden as VariantTarget).y).toBe(15)
      expect((staggerChild.visible as VariantTarget).y).toBe(0)
    })

    it('should include scale transform', () => {
      expect((staggerChild.hidden as VariantTarget).scale).toBe(0.95)
      expect((staggerChild.visible as VariantTarget).scale).toBe(1)
    })
  })

  describe('scalePop', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(scalePop).toHaveProperty('hidden')
      expect(scalePop).toHaveProperty('visible')
      expect(scalePop).toHaveProperty('exit')
    })

    it('should have spring transition in visible', () => {
      const transition = (scalePop.visible as VariantTarget).transition as VariantTarget
      expect(transition.type).toBe('spring')
      expect(transition.stiffness).toBeDefined()
      expect(transition.damping).toBeDefined()
    })
  })

  describe('slideFromLeft', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(slideFromLeft).toHaveProperty('hidden')
      expect(slideFromLeft).toHaveProperty('visible')
      expect(slideFromLeft).toHaveProperty('exit')
    })

    it('should start at -100% x position', () => {
      expect((slideFromLeft.hidden as VariantTarget).x).toBe('-100%')
    })

    it('should end at 0 x position when visible', () => {
      expect((slideFromLeft.visible as VariantTarget).x).toBe(0)
    })
  })

  describe('slideFromRight', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(slideFromRight).toHaveProperty('hidden')
      expect(slideFromRight).toHaveProperty('visible')
      expect(slideFromRight).toHaveProperty('exit')
    })

    it('should start at 100% x position', () => {
      expect((slideFromRight.hidden as VariantTarget).x).toBe('100%')
    })

    it('should end at 0 x position when visible', () => {
      expect((slideFromRight.visible as VariantTarget).x).toBe(0)
    })
  })

  describe('typewriter', () => {
    it('should have hidden and visible states', () => {
      expect(typewriter).toHaveProperty('hidden')
      expect(typewriter).toHaveProperty('visible')
    })

    it('should animate width from 0 to 100%', () => {
      expect((typewriter.hidden as VariantTarget).width).toBe(0)
      expect((typewriter.visible as VariantTarget).width).toBe('100%')
    })
  })

  describe('pageTransition', () => {
    it('should have hidden, visible, and exit states', () => {
      expect(pageTransition).toHaveProperty('hidden')
      expect(pageTransition).toHaveProperty('visible')
      expect(pageTransition).toHaveProperty('exit')
    })

    it('should have staggerChildren config in visible', () => {
      const transition = (pageTransition.visible as VariantTarget).transition as VariantTarget
      expect(transition.staggerChildren).toBeDefined()
    })

    it('should have when: beforeChildren config', () => {
      const transition = (pageTransition.visible as VariantTarget).transition as VariantTarget
      expect(transition.when).toBe('beforeChildren')
    })
  })

  describe('springConfigs', () => {
    it('should export all spring presets', () => {
      expect(springConfigs.snappy).toBeDefined()
      expect(springConfigs.smooth).toBeDefined()
      expect(springConfigs.bouncy).toBeDefined()
      expect(springConfigs.stiff).toBeDefined()
    })

    it('should have type: spring in all configs', () => {
      expect(springConfigs.snappy.type).toBe('spring')
      expect(springConfigs.smooth.type).toBe('spring')
      expect(springConfigs.bouncy.type).toBe('spring')
      expect(springConfigs.stiff.type).toBe('spring')
    })

    it('should have stiffness and damping values', () => {
      expect(springConfigs.snappy.stiffness).toBeDefined()
      expect(springConfigs.snappy.damping).toBeDefined()
    })
  })

  describe('transitions', () => {
    it('should export all transition presets', () => {
      expect(transitions.fast).toBeDefined()
      expect(transitions.normal).toBeDefined()
      expect(transitions.slow).toBeDefined()
    })

    it('should have duration in all presets', () => {
      expect(transitions.fast.duration).toBeDefined()
      expect(transitions.normal.duration).toBeDefined()
      expect(transitions.slow.duration).toBeDefined()
    })

    it('should have ease in all presets', () => {
      expect(transitions.fast.ease).toBeDefined()
      expect(transitions.normal.ease).toBeDefined()
      expect(transitions.slow.ease).toBeDefined()
    })

    it('should have increasing durations', () => {
      expect(transitions.fast.duration).toBeLessThan(transitions.normal.duration)
      expect(transitions.normal.duration).toBeLessThan(transitions.slow.duration)
    })
  })
})

describe('Animation Export Structure', () => {
  it('should export all required animation variants as Variants type', () => {
    const variants: Variants[] = [
      fadeIn,
      slideUp, 
      glitch,
      glow,
      staggerContainer,
      staggerChild,
      scalePop,
      slideFromLeft,
      slideFromRight,
      typewriter,
      pageTransition,
    ]
    
    expect(variants.length).toBe(11)
    variants.forEach(v => {
      expect(v).toBeDefined()
      expect(typeof v).toBe('object')
    })
  })
})

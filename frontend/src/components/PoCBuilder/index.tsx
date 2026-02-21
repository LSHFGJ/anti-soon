import React, { useMemo, useEffect, useCallback, useState } from 'react'
import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import { usePoCBuilder } from '../../hooks/usePoCBuilder'
import { usePoCSubmission } from '../../hooks/usePoCSubmission'
import { useWallet } from '../../hooks/useWallet'
import { DEMO_PROJECTS, H01_POC_TEMPLATE, DUMMYVAULT_POC_TEMPLATES } from '../../config'
import type { PoCData } from '../../types/poc'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

import { TargetStep } from './Steps/TargetStep'
import { ConditionsStep } from './Steps/ConditionsStep'
import { TransactionsStep } from './Steps/TransactionsStep'
import { ImpactStep } from './Steps/ImpactStep'
import { ReviewStep } from './Steps/ReviewStep'

interface PoCBuilderProps {
  selectedProject?: typeof DEMO_PROJECTS[0] | null
  submissionProjectId: bigint | null
}

const stepLabels = ['TARGET', 'CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW'] as const

const stepSurfaceVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    transition: {
      duration: 0.2,
      ease: 'linear'
    }
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'linear'
    }
  }
}

const StepSurface: React.FC<{
  step: number
  activeStep: number
  children: React.ReactNode
}> = React.memo(({ step, activeStep, children }) => {
  const isActive = activeStep === step

  return (
    <motion.div
      data-builder-step-surface={step}
      initial={false}
      variants={stepSurfaceVariants}
      animate={isActive ? 'visible' : 'hidden'}
      className={isActive ? 'block pointer-events-auto' : 'hidden pointer-events-none'}
      aria-hidden={!isActive}
    >
      {children}
    </motion.div>
  )
})

StepSurface.displayName = 'StepSurface'

export const PoCBuilder: React.FC<PoCBuilderProps> = ({ selectedProject, submissionProjectId }) => {
  const { 
    activeStep, 
    setActiveStep,
    targetConfig, 
    updateTargetConfig,
    conditions, 
    addCondition, 
    removeCondition, 
    updateCondition,
    transactions, 
    addTransaction, 
    removeTransaction, 
    updateTransaction,
    impactConfig, 
    updateImpactConfig,
    generatePoCJSON,
    loadTemplate
  } = usePoCBuilder()

  useEffect(() => {
    if (selectedProject) {
      loadTemplate({
        target: selectedProject.targetContract,
        chain: selectedProject.chain,
        forkBlock: parseInt(selectedProject.forkBlock) || 0
      })
      // Don't reset to step 1 automatically if user has moved on, 
      // but for initial load it's fine. 
      // Actually, let's only reset if we are on step 1 to avoid annoying jumps
      setActiveStep(prev => prev === 1 ? 1 : prev)
    }
  }, [selectedProject, loadTemplate, setActiveStep])

  const [showTemplateModal, setShowTemplateModal] = useState(false)

  const handleLoadExample = useCallback(() => {
    if (selectedProject?.id === 'dummy-vault-001') {
      setShowTemplateModal(true)
    } else {
      if (confirm("Load 'Checkpointer Bypass' Template? This will overwrite current inputs.")) {
        loadTemplate(H01_POC_TEMPLATE as unknown as Partial<PoCData>)
        setActiveStep(5)
      }
    }
  }, [selectedProject, loadTemplate, setActiveStep])

  const handleTemplateSelect = useCallback((templateKey: string) => {
    const template = DUMMYVAULT_POC_TEMPLATES[templateKey as keyof typeof DUMMYVAULT_POC_TEMPLATES]
    if (template) {
      loadTemplate(template.template as unknown as Partial<PoCData>)
      setShowTemplateModal(false)
      setActiveStep(5)
    }
  }, [loadTemplate, setActiveStep])

  const {
    isSubmitting,
    commitTxHash,
    revealTxHash,
    error,
    submitPoC
  } = usePoCSubmission()

  const { isConnected, connect } = useWallet()

  const pocJson = useMemo(() => generatePoCJSON(), [generatePoCJSON])

  const handleNext = useCallback(() => setActiveStep(prev => prev + 1), [setActiveStep])
  const handleBack = useCallback(() => setActiveStep(prev => prev - 1), [setActiveStep])
  const handleSubmit = useCallback(() => {
    if (submissionProjectId === null) return undefined
    return submitPoC(submissionProjectId, pocJson)
  }, [submitPoC, submissionProjectId, pocJson])
  const handleStepSelect = useCallback((step: number) => setActiveStep(step), [setActiveStep])

  return (
    <section
      id="builder"
      data-builder-shell="content"
      className="container px-4 py-4 min-h-0 flex-1 flex flex-col border-l border-[var(--color-text-dim)]"
    >
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-[var(--color-primary)] text-base">{`// PoC_BUILDER_V1.0`}</h2>
        {selectedProject && (
          <div className="border border-[var(--color-secondary)] px-4 py-2 text-[var(--color-secondary)] text-xs bg-[rgba(124,58,237,0.05)]">
            PROJECT: {selectedProject.name.toUpperCase()}
          </div>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className="relative mb-4 flex-shrink-0">
        <div className="h-1 bg-[var(--color-text-dim)]/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]"
            initial={false}
            animate={{ width: `${(activeStep / 5) * 100}%` }}
            transition={{ duration: 0.2, ease: 'linear' }}
          />
        </div>
      </div>

      {/* Step Navigation */}
      <div className="flex gap-2 mb-4 overflow-x-auto shrink-0">
        {[1, 2, 3, 4, 5].map(step => {
          const isCompleted = activeStep > step
          const isActive = activeStep === step
          return (
            <Button
              key={step}
              variant="ghost"
              size="sm"
              onClick={() => handleStepSelect(step)}
              className={cn(
                "relative min-w-[100px] font-mono text-xs tracking-wider transition-all duration-300",
                "border rounded-sm",
                isActive && "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 hover:text-[var(--color-bg)]",
                isCompleted && !isActive && "border-[var(--color-secondary)] text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10",
                !isCompleted && !isActive && "border-[var(--color-text-dim)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-text)]"
              )}
            >
              <span className="flex items-center gap-2">
                {isCompleted && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[var(--color-secondary)]"
                  >
                    ✓
                  </motion.span>
                )}
                <span>{stepLabels[step - 1]}</span>
              </span>
            </Button>
          )
        })}
      </div>

      <div
        data-builder-scroll-owner="primary"
        className="bg-[rgba(255,255,255,0.03)] p-4 border border-[var(--color-text-dim)] flex-1 min-h-0 overflow-auto"
      >
        
        <StepSurface step={1} activeStep={activeStep}>
          <TargetStep 
            config={targetConfig} 
            onUpdate={updateTargetConfig} 
            onNext={handleNext} 
            onLoadExample={handleLoadExample}
          />
        </StepSurface>

        <StepSurface step={2} activeStep={activeStep}>
          <ConditionsStep 
            conditions={conditions} 
            onAdd={addCondition} 
            onRemove={removeCondition} 
            onUpdate={updateCondition} 
            onNext={handleNext}
            onBack={handleBack}
          />
        </StepSurface>

        <StepSurface step={3} activeStep={activeStep}>
          <TransactionsStep 
            transactions={transactions} 
            onAdd={addTransaction} 
            onRemove={removeTransaction} 
            onUpdate={updateTransaction} 
            onNext={handleNext}
            onBack={handleBack}
          />
        </StepSurface>

        <StepSurface step={4} activeStep={activeStep}>
          <ImpactStep 
            config={impactConfig} 
            onUpdate={updateImpactConfig} 
            onNext={handleNext}
            onBack={handleBack}
          />
        </StepSurface>

        <StepSurface step={5} activeStep={activeStep}>
          <ReviewStep
            pocJson={pocJson}
            isConnected={isConnected}
            isSubmitting={isSubmitting}
            submissionHash={commitTxHash || revealTxHash || ''}
            error={error || null}
            onConnect={connect}
            onSubmit={handleSubmit}
            onBack={handleBack}
            projectId={submissionProjectId}
            useV2={true}
          />
        </StepSurface>

      </div>

      {/* Template Selection Modal for DummyVault */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-[#0a0a0a]/90 flex items-center justify-center z-[1000]">
          <div className="bg-[var(--color-bg)] border border-[var(--color-primary)] p-8 max-w-[600px] w-[90%] max-h-[80vh] overflow-auto">
            <h3 className="text-[var(--color-primary)] mb-6 font-mono">
              {`// SELECT_POC_TEMPLATE`}
            </h3>
            <div className="grid gap-4">
              {Object.entries(DUMMYVAULT_POC_TEMPLATES).map(([key, template]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleTemplateSelect(key)}
                  className="bg-transparent border border-[var(--color-text-dim)] p-4 text-left cursor-pointer transition-all duration-200 hover:border-[var(--color-primary)] hover:bg-[rgba(124,58,237,0.05)]"
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-[var(--color-primary)] font-bold">{template.name}</span>
                    <span className={cn(
                      "text-[0.8rem] px-2 py-[0.1rem] border",
                      template.severity === 'HIGH' 
                        ? "text-[var(--color-error)] border-[var(--color-error)]" 
                        : "text-[var(--color-text)] border-[var(--color-text-dim)]"
                    )}>
                      {template.severity}
                    </span>
                  </div>
                  <p className="text-[var(--color-text-dim)] text-sm m-0">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowTemplateModal(false)}
              className="mt-6 bg-transparent border border-[var(--color-text-dim)] text-[var(--color-text)] px-4 py-2 cursor-pointer font-mono hover:border-[var(--color-text)]"
            >
              [ CANCEL ]
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

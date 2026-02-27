import React, { useMemo, useEffect, useCallback, useState } from 'react'
import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import { usePoCBuilder } from '../../hooks/usePoCBuilder'
import { usePoCSubmission } from '../../hooks/usePoCSubmission'
import { useWallet } from '../../hooks/useWallet'
import { H01_POC_TEMPLATE, DUMMYVAULT_POC_TEMPLATES } from '../../config'
import type { PoCData } from '../../types/poc'
import { Button } from '../ui/button'
import { NeonPanel } from '../shared/ui-primitives'
import { cn } from '../../lib/utils'

import { TargetStep } from './Steps/TargetStep'
import { ConditionsStep } from './Steps/ConditionsStep'
import { TransactionsStep } from './Steps/TransactionsStep'
import { ImpactStep } from './Steps/ImpactStep'
import { ReviewStep } from './Steps/ReviewStep'

type DemoProject = (typeof import('../../config').DEMO_PROJECTS)[number]

interface PoCBuilderProps {
  selectedProject?: DemoProject | null
  submissionProjectId: bigint | null
}

const stepLabels = ['TARGET', 'CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW'] as const
const firstStep = 1
const lastStep = stepLabels.length

const stepSurfaceVariants: Variants = {
  hidden: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'linear'
    }
  },
  visible: {
    opacity: 1,
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
      className={isActive ? 'block h-full pointer-events-auto' : 'hidden pointer-events-none'}
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
          forkBlock: parseInt(selectedProject.forkBlock, 10) || 0
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

  const { isConnected, connect } = useWallet({ autoSwitchToSepolia: false })

  const pocJson = useMemo(() => generatePoCJSON(), [generatePoCJSON])

  const handleNext = useCallback(() => setActiveStep(prev => prev + 1), [setActiveStep])
  const handleBack = useCallback(() => setActiveStep(prev => prev - 1), [setActiveStep])
  const handleSubmit = useCallback(() => {
    if (submissionProjectId === null) return undefined
    return submitPoC(submissionProjectId, pocJson)
  }, [submitPoC, submissionProjectId, pocJson])
  const handleStepSelect = useCallback((step: number) => setActiveStep(step), [setActiveStep])

  const renderStepIndicator = useCallback(() => (
    <div className="wizard-steps">
      {stepLabels.map((step, index) => {
        const stepNumber = index + 1
        const isCompleted = stepNumber < activeStep
        const isActive = stepNumber === activeStep

        return (
          <React.Fragment key={step}>
            <button
              type="button"
              onClick={() => handleStepSelect(stepNumber)}
              aria-label={step}
              className={cn(
                'wizard-step rounded-sm border-0 bg-transparent p-0 text-left',
                'transition-all duration-200 ease-linear',
                isCompleted && 'completed',
                isActive && 'active',
                isActive && 'drop-shadow-[0_0_10px_var(--color-primary-dim)]'
              )}
            >
              <div className="flex items-center">
                <div className={cn('wizard-step-number', isCompleted && 'completed', isActive && 'active')}>
                  {isCompleted ? '✓' : stepNumber}
                </div>
                <span
                  className={cn(
                    'wizard-step-label ml-2',
                    isActive && 'active',
                    stepNumber <= activeStep ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-dim)]'
                  )}
                >
                  {step}
                </span>
              </div>
            </button>
            {index < stepLabels.length - 1 ? (
              <div className={cn('wizard-connector mx-3', isCompleted ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-text-dim)]')} />
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  ), [activeStep, handleStepSelect])

  return (
    <section
      id="builder"
      data-builder-shell="content"
      className="w-full min-h-0 flex-1 flex flex-col"
    >
      <div className="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {renderStepIndicator()}
          <p className="mt-2 text-center lg:hidden font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-secondary)]">
            Step {activeStep}/{lastStep}: {stepLabels[activeStep - 1]}
          </p>
        </div>
        {selectedProject ? (
          <div className="self-start border border-[var(--color-secondary)] px-3 py-1.5 text-[11px] text-[var(--color-secondary)] bg-[rgba(124,58,237,0.05)] whitespace-nowrap md:self-auto">
            PROJECT: {selectedProject.name.toUpperCase()}
          </div>
        ) : null}
      </div>

      <NeonPanel className="flex-1 min-h-0" contentClassName="h-full min-h-0 p-4">
        <div data-builder-scroll-owner="primary" className="h-full min-h-0 overflow-y-auto pr-1">
          <StepSurface step={1} activeStep={activeStep}>
            <TargetStep 
              config={targetConfig} 
              onUpdate={updateTargetConfig} 
              onNext={handleNext} 
              onLoadExample={handleLoadExample}
              showStepNavigation={false}
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
              showStepNavigation={false}
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
              showStepNavigation={false}
            />
          </StepSurface>

          <StepSurface step={4} activeStep={activeStep}>
            <ImpactStep 
              config={impactConfig} 
              onUpdate={updateImpactConfig} 
              onNext={handleNext}
              onBack={handleBack}
              showStepNavigation={false}
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
              showBackButton={true}
            />
          </StepSurface>
        </div>
      </NeonPanel>

      {activeStep < lastStep ? (
        <div className="mt-4 flex shrink-0 justify-between gap-4 border-t border-[var(--color-bg-light)] pt-4">
          <Button
            type="button"
            onClick={handleBack}
            disabled={activeStep === firstStep}
            variant="outline"
            className={cn('btn-cyber', activeStep === firstStep && 'opacity-50 cursor-not-allowed')}
          >
            [ PREVIOUS ]
          </Button>
          <Button type="button" onClick={handleNext} className="btn-cyber">
            [ NEXT ]
          </Button>
        </div>
      ) : null}

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

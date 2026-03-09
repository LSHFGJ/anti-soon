import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import { H01_POC_TEMPLATE, DUMMYVAULT_POC_TEMPLATES } from '../../config'
import { usePoCBuilder } from '../../hooks/usePoCBuilder'
import { useToast } from '../../hooks/use-toast'
import { useWallet } from '../../hooks/useWallet'
import { cn } from '../../lib/utils'
import type { Project } from '../../types'
import type { PoCData } from '../../types/poc'
import { ConditionsStep } from './Steps/ConditionsStep'
import { ImpactStep } from './Steps/ImpactStep'
import { ReviewStep } from './Steps/ReviewStep'
import { TargetStep } from './Steps/TargetStep'
import { TransactionsStep } from './Steps/TransactionsStep'
import { NeonPanel } from '../shared/ui-primitives'
import { Button } from '../ui/button'

type DemoProject = (typeof import('../../config').DEMO_PROJECTS)[number]

interface PoCBuilderProps {
  selectedProject?: DemoProject | null
  submissionProjectId: bigint | null
  availableProjects?: Project[]
  onProjectContextChange?: (projectId: bigint) => void
}

const stepLabels = ['TARGET', 'CONDITIONS', 'TRANSACTIONS', 'IMPACT', 'REVIEW'] as const
const firstStep = 1
const lastStep = stepLabels.length

function inferChainFromProject(project: Project): string {
  const rpcUrl = project.vnetRpcUrl.toLowerCase()

  if (rpcUrl.includes('arbitrum')) return 'Arbitrum'
  if (rpcUrl.includes('optimism')) return 'Optimism'
  if (rpcUrl.includes('mainnet') && !rpcUrl.includes('sepolia')) return 'Mainnet'
  return 'Sepolia'
}

function buildTemplateFromProject(project: Project): Partial<PoCData> {
  return {
    target: project.targetContract,
    chain: inferChainFromProject(project),
    forkBlock: Number(project.forkBlock),
  }
}

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

export const PoCBuilder: React.FC<PoCBuilderProps> = ({
  selectedProject,
  submissionProjectId,
  availableProjects = [],
  onProjectContextChange,
}) => {
  const projectSelectionOnly = false
  const [projectContextHighlightNonce, setProjectContextHighlightNonce] = useState(0)
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
    templateVersion,
    generatePoCJSON,
    loadTemplate
  } = usePoCBuilder()

  const selectedOnChainProject = useMemo(() => {
    if (submissionProjectId === null) {
      return null
    }

    return availableProjects.find((project) => project.id === submissionProjectId) ?? null
  }, [availableProjects, submissionProjectId])

  const appliedOnChainProjectIdRef = useRef<bigint | null>(null)

  const handleOnChainProjectSelect = useCallback((projectId: bigint) => {
    onProjectContextChange?.(projectId)

    const selected = availableProjects.find((project) => project.id === projectId)
    if (!selected) {
      return
    }

    appliedOnChainProjectIdRef.current = selected.id
    loadTemplate(buildTemplateFromProject(selected))
    setActiveStep((prev) => (prev === 1 ? 1 : prev))
  }, [availableProjects, loadTemplate, onProjectContextChange, setActiveStep])

  const handleRetryProjectContext = useCallback(() => {
    setActiveStep(1)
    setProjectContextHighlightNonce((prev) => prev + 1)
  }, [setActiveStep])

  useEffect(() => {
    if (!selectedOnChainProject) {
      appliedOnChainProjectIdRef.current = null
      return
    }

    if (appliedOnChainProjectIdRef.current === selectedOnChainProject.id) {
      return
    }

    appliedOnChainProjectIdRef.current = selectedOnChainProject.id
    loadTemplate(buildTemplateFromProject(selectedOnChainProject))
    setActiveStep((prev) => (prev === 1 ? 1 : prev))
  }, [selectedOnChainProject, loadTemplate, setActiveStep])

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
  const { info, success, warning } = useToast()

  const loadExampleTemplate = useCallback((template: Partial<PoCData>, templateLabel: string) => {
    loadTemplate(template)
    setActiveStep(lastStep)
    success({
      title: 'Example PoC Loaded',
      description: `${templateLabel} template applied. Review and adjust before submit.`,
    })
  }, [loadTemplate, setActiveStep, success])

  const handleLoadExample = useCallback(() => {
    if (selectedProject?.id === 'dummy-vault-001') {
      setShowTemplateModal(true)
      info({
        title: 'Select Example PoC',
        description: 'Choose a DummyVault template from the modal.',
      })
    } else {
      warning({
        title: 'Load Example PoC?',
        description: "This will overwrite current inputs with the Checkpointer Bypass template.",
        action: {
          label: 'LOAD',
          onClick: () => loadExampleTemplate(H01_POC_TEMPLATE as unknown as Partial<PoCData>, 'Checkpointer Bypass'),
        },
        cancel: {
          label: 'CANCEL',
        },
        duration: 6000,
      })
    }
  }, [selectedProject, info, warning, loadExampleTemplate])

  const handleTemplateSelect = useCallback((templateKey: string) => {
    const template = DUMMYVAULT_POC_TEMPLATES[templateKey as keyof typeof DUMMYVAULT_POC_TEMPLATES]
    if (template) {
      setShowTemplateModal(false)
      loadExampleTemplate(template.template as unknown as Partial<PoCData>, template.name)
    }
  }, [loadExampleTemplate])



	const { isConnected, isWrongNetwork, connect, switchToCorrectNetwork } = useWallet({ autoSwitchToSepolia: false })

  const pocJson = useMemo(() => generatePoCJSON(), [generatePoCJSON])

  const handleNext = useCallback(() => setActiveStep(prev => prev + 1), [setActiveStep])
  const handleBack = useCallback(() => setActiveStep(prev => prev - 1), [setActiveStep])

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
        {selectedOnChainProject ? (
          <div data-testid="builder-project-context" className="self-start border border-[var(--color-secondary)] px-3 py-1.5 text-[11px] text-[var(--color-secondary)] bg-[rgba(124,58,237,0.05)] whitespace-nowrap md:self-auto">
            CONTEXT_PROJECT_ID: #{selectedOnChainProject.id.toString()}
          </div>
        ) : selectedProject ? (
          <div data-testid="builder-project-context" className="self-start border border-[var(--color-secondary)] px-3 py-1.5 text-[11px] text-[var(--color-secondary)] bg-[rgba(124,58,237,0.05)] whitespace-nowrap md:self-auto">
            DEFAULT_PROJECT_ID: #{selectedProject.id}
          </div>
        ) : null}
      </div>

      <NeonPanel className="flex-none" contentClassName="p-4">
        <div data-builder-scroll-owner="primary" className="px-1">
          <StepSurface step={1} activeStep={activeStep}>
            <TargetStep 
              config={targetConfig} 
              onUpdate={updateTargetConfig} 
              onNext={handleNext} 
              isActive={activeStep === 1}
              availableProjects={availableProjects}
              selectedProjectId={selectedOnChainProject?.id ?? null}
              onSelectProject={handleOnChainProjectSelect}
              showStepNavigation={false}
              projectSelectionOnly={projectSelectionOnly}
              projectContextHighlightNonce={projectContextHighlightNonce}
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
              key={templateVersion}
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
				isWrongNetwork={isWrongNetwork}
				isActive={activeStep === 5}
				onConnect={connect}
				onSwitchNetwork={() => void switchToCorrectNetwork()}
				onBack={handleBack}
				onLoadExample={handleLoadExample}
				onRetryProjectContext={handleRetryProjectContext}
              projectId={submissionProjectId}
              useV2={true}
              showBackButton={true}
            />
          </StepSurface>
        </div>
      </NeonPanel>

      {activeStep < lastStep ? (
        <div className="mt-4 grid shrink-0 grid-cols-3 gap-3 border-t border-[var(--color-bg-light)] pt-4">
          <Button
            type="button"
            onClick={handleBack}
            disabled={activeStep === firstStep}
            variant="outline"
            className={cn('btn-cyber justify-self-start', activeStep === firstStep && 'opacity-50 cursor-not-allowed')}
          >
            [ PREVIOUS ]
          </Button>
          <Button type="button" onClick={handleLoadExample} variant="outline" className="btn-cyber justify-self-center">
            [ LOAD_EXAMPLE_POC ]
          </Button>
          <Button type="button" onClick={handleNext} className="btn-cyber justify-self-end">
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

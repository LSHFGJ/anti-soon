import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { targetConfigSchema, type TargetConfigFormData } from '../../../lib/validations/poc'
import { createReactHookFormZodResolver } from '../../../lib/reactHookFormZodResolver'
import { cn } from '../../../lib/utils'
import type { Project } from '../../../types'
import type { TargetConfig } from '../../../types/poc'
import { StepGuidance } from '../../StepGuidance'
import { STEP_GUIDES } from '../../StepGuidance/guides'
import { Button } from '../../ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import { useDeferredFieldUpdates } from './useDeferredFieldUpdates'

function inferProjectChainLabel(project: Project): string {
  const rpcUrl = project.vnetRpcUrl.toLowerCase()

  if (rpcUrl.includes('arbitrum')) return 'Arbitrum'
  if (rpcUrl.includes('optimism')) return 'Optimism'
  if (rpcUrl.includes('mainnet') && !rpcUrl.includes('sepolia')) return 'Mainnet'
  return 'Sepolia'
}

interface TargetStepProps {
  config: TargetConfig
  onUpdate: (field: keyof TargetConfig, value: string) => void
  onNext?: () => void
  availableProjects?: Project[]
  selectedProjectId?: bigint | null
  onSelectProject?: (projectId: bigint) => void
  showStepNavigation?: boolean
  projectSelectionOnly?: boolean
  projectContextHighlightNonce?: number
  isActive?: boolean
}

export const TargetStep: React.FC<TargetStepProps> = React.memo(({ 
  config, 
  onUpdate, 
  onNext, 
  availableProjects = [],
  selectedProjectId = null,
  onSelectProject,
  showStepNavigation = true,
  projectSelectionOnly = false,
  projectContextHighlightNonce = 0,
  isActive = true,
}) => {
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null)
  const pendingProjectContextHighlightRef = useRef(false)
  const [isProjectContextHighlighted, setIsProjectContextHighlighted] = useState(false)
  const { schedule, flushAll } = useDeferredFieldUpdates<keyof TargetConfig>(onUpdate)
  const selectedProject = useMemo(
    () => availableProjects.find((project) => project.id === selectedProjectId) ?? null,
    [availableProjects, selectedProjectId],
  )
  const projectContractOptions = useMemo(
    () => selectedProject ? [{ value: selectedProject.targetContract, label: selectedProject.targetContract }] : [],
    [selectedProject],
  )

  const form = useForm<TargetConfigFormData>({
    resolver: createReactHookFormZodResolver(targetConfigSchema),
    defaultValues: {
      targetContract: config.targetContract,
      forkBlock: config.forkBlock,
    },
    mode: 'onChange',
  })

  useEffect(() => {
    form.reset({
      targetContract: config.targetContract,
      forkBlock: config.forkBlock,
    })
  }, [
    config.forkBlock,
    config.targetContract,
    form,
  ])

  useEffect(() => {
    if (projectContextHighlightNonce <= 0) {
      return
    }

    pendingProjectContextHighlightRef.current = true
  }, [projectContextHighlightNonce])

  useEffect(() => {
    if (projectContextHighlightNonce <= 0 || !isActive || !pendingProjectContextHighlightRef.current) {
      return
    }

    pendingProjectContextHighlightRef.current = false

    setIsProjectContextHighlighted(true)

    const animationFrame = window.requestAnimationFrame(() => {
      projectTriggerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      projectTriggerRef.current?.focus()
    })

    const timer = window.setTimeout(() => {
      setIsProjectContextHighlighted(false)
    }, 2600)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timer)
    }
  }, [isActive, projectContextHighlightNonce])

  const handleProjectSelect = useCallback((value: string) => {
    if (!onSelectProject) {
      return
    }

    if (!value) {
      return
    }

    try {
      onSelectProject(BigInt(value))
    } catch {
      return
    }
  }, [onSelectProject])

  const handleContractSelect = useCallback((value: string) => {
    form.setValue('targetContract', value, { shouldValidate: true, shouldDirty: true })
    schedule('targetContract', value)
  }, [form, schedule])

  const handleSubmit = useCallback((data: TargetConfigFormData) => {
    flushAll()
    Object.entries(data).forEach(([key, value]) => {
      onUpdate(key as keyof TargetConfig, value)
    })
    onNext?.()
  }, [flushAll, onUpdate, onNext])

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.target} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormItem>
            <FormLabel className="text-[var(--color-text)] text-sm font-medium">
              Target Project
            </FormLabel>
            <FormControl>
              <Select
                value={selectedProjectId?.toString() ?? ''}
                onValueChange={handleProjectSelect}
              >
                <SelectTrigger
                  ref={projectTriggerRef}
                  data-testid="target-project-select-trigger"
                  data-highlighted={isProjectContextHighlighted ? 'true' : 'false'}
                  style={
                    isProjectContextHighlighted
                      ? {
                          borderColor: 'var(--color-warning)',
                          boxShadow: 'inset 0 0 0 2px rgba(245,158,11,0.55)',
                          backgroundColor: 'rgba(245,158,11,0.08)',
                        }
                      : undefined
                  }
                  className={cn(
                    'h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors ring-0 shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:outline-none',
                    isProjectContextHighlighted && 'animate-pulse',
                  )}
                >
                  <SelectValue placeholder="[ SELECT_PROJECT_FROM_EXPLORER ]" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                  {availableProjects.map((project) => (
                    <SelectItem
                      key={project.id.toString()}
                      value={project.id.toString()}
                      className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent"
                    >
                      #{project.id.toString()} · {project.targetContract.slice(0, 6)}...{project.targetContract.slice(-4)} · {inferProjectChainLabel(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
          </FormItem>

          <FormField
            control={form.control}
            name="targetContract"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                  Target Contract Address
                </FormLabel>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={handleContractSelect}
                    disabled={projectContractOptions.length === 0 || (projectSelectionOnly && projectContractOptions.length === 1)}
                  >
                    <SelectTrigger className="h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors ring-0 shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:outline-none">
                      <SelectValue placeholder="[ SELECT_CONTRACT_FROM_PROJECT ]" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                      {projectContractOptions.map((contract) => (
                        <SelectItem
                          key={contract.value}
                          value={contract.value}
                          className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent"
                        >
                          {contract.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage className="text-[var(--color-error)] text-xs" />
              </FormItem>
            )}
          />

          {showStepNavigation ? (
            <div className="mt-4 text-right">
              <Button 
                type="submit"
                className="font-mono text-sm px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary)]/90 tracking-wider"
              >
                NEXT &gt;&gt;
              </Button>
            </div>
          ) : null}
        </form>
      </Form>
    </div>
  )
})

TargetStep.displayName = 'TargetStep'

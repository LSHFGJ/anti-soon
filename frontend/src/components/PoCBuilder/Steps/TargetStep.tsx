import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TargetConfig } from '../../../types/poc'
import type { Project } from '../../../types'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../ui/form'
import { Input } from '../../ui/input'
import { Button } from '../../ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import {
  chainOptions,
  targetConfigSchema,
} from '../../../lib/validations/poc'
import type { TargetConfigFormData } from '../../../lib/validations/poc'
import { useDeferredFieldUpdates } from './useDeferredFieldUpdates'
import { cn } from '../../../lib/utils'

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
  const { schedule, flush, flushAll } = useDeferredFieldUpdates<keyof TargetConfig>(onUpdate)
  const chainValue = chainOptions.includes(config.chain as typeof chainOptions[number])
    ? (config.chain as typeof chainOptions[number])
    : 'Sepolia'

  const form = useForm<TargetConfigFormData>({
    resolver: zodResolver(targetConfigSchema),
    defaultValues: {
      targetContract: config.targetContract,
      chain: chainValue,
      forkBlock: config.forkBlock,
      abiJson: config.abiJson,
    },
    mode: 'onChange',
  })

  useEffect(() => {
    form.reset({
      targetContract: config.targetContract,
      chain: chainValue,
      forkBlock: config.forkBlock,
      abiJson: config.abiJson,
    })
  }, [
    chainValue,
    config.abiJson,
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
    if (!isActive || !pendingProjectContextHighlightRef.current) {
      return
    }

    pendingProjectContextHighlightRef.current = false

    setIsProjectContextHighlighted(true)
    window.requestAnimationFrame(() => {
      projectTriggerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      projectTriggerRef.current?.focus()
    })

    const timer = window.setTimeout(() => {
      setIsProjectContextHighlighted(false)
    }, 2600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isActive])

  const handleFieldChange = useCallback((
    field: keyof TargetConfig, 
    onChange: (value: string) => void
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      onChange(value)
      schedule(field, value)
    }
  }, [schedule])

  const handleAbiChange = useCallback((value: string) => {
    if (projectSelectionOnly) {
      return
    }
    form.setValue('abiJson', value, { shouldValidate: true })
    schedule('abiJson', value)
  }, [form, projectSelectionOnly, schedule])

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
              Explorer Project (On-chain)
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
                    <Input
                      {...field}
                      placeholder="0x..."
                      onChange={projectSelectionOnly ? undefined : handleFieldChange('targetContract', field.onChange)}
                      onBlur={() => flush('targetContract')}
                      disabled={projectSelectionOnly}
                      className="bg-[var(--color-bg)] border-[var(--color-text-dim)] text-[var(--color-text)] font-mono text-sm focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                </FormControl>
                <FormMessage className="text-[var(--color-error)] text-xs" />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="chain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                    Chain
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      disabled={projectSelectionOnly}
                      onValueChange={(value) => {
                        if (projectSelectionOnly) return
                        field.onChange(value)
                        schedule('chain', value)
                      }}
                    >
                    <SelectTrigger className="h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors ring-0 shadow-none focus:ring-0 focus:shadow-none focus-visible:ring-0 focus-visible:outline-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                        <SelectItem value="Mainnet" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Ethereum Mainnet</SelectItem>
                        <SelectItem value="Sepolia" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Sepolia Testnet</SelectItem>
                        <SelectItem value="Optimism" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Optimism</SelectItem>
                        <SelectItem value="Arbitrum" className="text-[var(--color-text)] text-xs font-mono outline-none ring-0 shadow-none focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)] focus:ring-0 focus-visible:ring-0 data-[state=checked]:bg-transparent">Arbitrum</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />

          </div>

          {!projectSelectionOnly ? (
            <FormField
              control={form.control}
              name="abiJson"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className="text-[var(--color-text-dim)] text-sm font-medium">
                    Contract ABI (JSON)
                  </FormLabel>
                  <FormControl>
                    <div className="abi-upload-area">
                      <CodeEditor
                        value={field.value}
                        onChange={handleAbiChange}
                        language="json"
                        height={220}
                        readOnly={projectSelectionOnly}
                        placeholder='[{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
                        error={fieldState.error?.message}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />
          ) : null}

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

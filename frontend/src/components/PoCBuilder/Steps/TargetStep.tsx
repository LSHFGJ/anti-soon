import React, { useCallback, useEffect } from 'react'
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
  chainOptions,
  targetConfigSchema,
} from '../../../lib/validations/poc'
import type { TargetConfigFormData } from '../../../lib/validations/poc'
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
}

export const TargetStep: React.FC<TargetStepProps> = React.memo(({ 
  config, 
  onUpdate, 
  onNext, 
  availableProjects = [],
  selectedProjectId = null,
  onSelectProject,
  showStepNavigation = true,
}) => {
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
    form.setValue('abiJson', value, { shouldValidate: true })
    schedule('abiJson', value)
  }, [form, schedule])

  const handleProjectSelect = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onSelectProject) {
      return
    }

    const value = event.target.value
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
              <select
                value={selectedProjectId?.toString() ?? ''}
                onChange={handleProjectSelect}
                className="flex h-10 w-full rounded-md border border-[var(--color-text-dim)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] font-mono focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
              >
                <option value="">[ SELECT_PROJECT_FROM_EXPLORER ]</option>
                {availableProjects.map((project) => (
                  <option key={project.id.toString()} value={project.id.toString()}>
                    #{project.id.toString()} · {project.targetContract.slice(0, 6)}...{project.targetContract.slice(-4)} · {inferProjectChainLabel(project)} · BLOCK {project.forkBlock.toString()}
                  </option>
                ))}
              </select>
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
                      onChange={handleFieldChange('targetContract', field.onChange)}
                      onBlur={() => flush('targetContract')}
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
                    <select 
                      value={field.value} 
                      onChange={handleFieldChange('chain', field.onChange)}
                      onBlur={() => flush('chain')}
                      className="flex h-10 w-full rounded-md border border-[var(--color-text-dim)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] font-mono focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
                    >
                      <option value="Mainnet">Ethereum Mainnet</option>
                      <option value="Sepolia">Sepolia Testnet</option>
                      <option value="Optimism">Optimism</option>
                      <option value="Arbitrum">Arbitrum</option>
                    </select>
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="forkBlock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                    Fork Block Number
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="e.g. 18500000"
                      onChange={handleFieldChange('forkBlock', field.onChange)}
                      onBlur={() => flush('forkBlock')}
                      className="bg-[var(--color-bg)] border-[var(--color-text-dim)] text-[var(--color-text)] font-mono text-sm focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />
          </div>

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
                      placeholder='[{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
                      error={fieldState.error?.message}
                    />
                  </div>
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

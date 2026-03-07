import { z } from 'zod'

const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/
const hexRegex = /^0x[a-fA-F0-9]*$/

const isValidAddress = (value: string) => ethereumAddressRegex.test(value)
const isValidHex = (value: string) => value === '' || hexRegex.test(value)
const isValidJson = (value: string) => {
  if (!value.trim()) return true
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

export const conditionTypes = ['setBalance', 'setTimestamp', 'setStorage'] as const
export const impactTypes = ['fundsDrained', 'accessEscalation', 'stateCorruption', 'other'] as const
export const chainOptions = ['Mainnet', 'Sepolia', 'Optimism', 'Arbitrum'] as const
export const severityLevels = ['critical', 'high', 'medium', 'low'] as const

export const targetConfigSchema = z.object({
  targetContract: z
    .string()
    .min(1, 'Target address is required')
    .refine(isValidAddress, 'Invalid Ethereum address format'),
  forkBlock: z
    .string()
    .min(1, 'Fork block is required')
    .refine(
      (val) => /^\d+$/.test(val) && parseInt(val, 10) > 0,
      'Fork block must be a positive integer'
    ),
})

export const conditionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(conditionTypes, {
    errorMap: () => ({ message: 'Invalid condition type' }),
  }),
  target: z
    .string()
    .refine(
      (val) => !val || isValidAddress(val),
      'Invalid target address'
    )
    .optional(),
  value: z.string().min(1, 'Value is required'),
  slot: z
    .string()
    .refine(
      (val) => !val || isValidHex(val),
      'Invalid slot format (must be hex)'
    )
    .optional(),
})

export const transactionSchema = z.object({
  id: z.string().optional(),
  to: z
    .string()
    .min(1, 'Target address is required')
    .refine(isValidAddress, 'Invalid Ethereum address format'),
  value: z
    .string()
    .refine(
      (val) => val === '' || /^\d+(\.\d+)?$/.test(val),
      'Value must be a valid number'
    ),
  data: z
    .string()
    .refine(isValidHex, 'Data must be valid hex (0x prefixed)'),
  functionName: z.string().optional(),
  args: z.string().optional(),
})

export const impactConfigSchema = z.object({
  type: z.enum(impactTypes, {
    errorMap: () => ({ message: 'Please select an impact type' }),
  }),
  estimatedLoss: z
    .string()
    .refine(
      (val) => !val || /^\d+(\.\d+)?$/.test(val),
      'Estimated loss must be a valid number'
    ),
  description: z
    .string()
    .refine(
      (val) => val.length === 0 || val.length >= 10,
      'Description must be at least 10 characters'
    ),
})

export const pocFormSchema = z.object({
  targetContract: z
    .string()
    .min(1, 'Target address is required')
    .refine(isValidAddress, 'Invalid Ethereum address format'),
  chain: z.enum(chainOptions, {
    errorMap: () => ({ message: 'Please select a valid chain' }),
  }),
  forkBlock: z
    .string()
    .min(1, 'Fork block is required')
    .refine(
      (val) => /^\d+$/.test(val) && parseInt(val, 10) > 0,
      'Fork block must be a positive integer'
    ),
  
  conditions: z.array(conditionSchema).optional(),
  
  transactions: z
    .array(transactionSchema)
    .min(1, 'At least one transaction is required'),
  
  impact: impactConfigSchema,
})

export type TargetConfigFormData = z.infer<typeof targetConfigSchema>
export type ConditionFormData = z.infer<typeof conditionSchema>
export type TransactionFormData = z.infer<typeof transactionSchema>
export type ImpactConfigFormData = z.infer<typeof impactConfigSchema>
export type PocFormData = z.infer<typeof pocFormSchema>

export function createFormResolver<T extends z.ZodTypeAny>(schema: T) {
  return {
    validate: (data: unknown) => {
      const result = schema.safeParse(data)
      if (result.success) {
        return { success: true as const, data: result.data }
      }
      return { success: false as const, errors: result.error.flatten().fieldErrors }
    },
  }
}

export const validateAddress = (value: string): string | null => {
  if (!value) return 'Address is required'
  if (!isValidAddress(value)) return 'Invalid Ethereum address format'
  return null
}

export const validateBlockNumber = (value: string): string | null => {
  if (!value) return 'Block number is required'
  if (!/^\d+$/.test(value) || parseInt(value, 10) <= 0) {
    return 'Block number must be a positive integer'
  }
  return null
}

export const validateHexData = (value: string): string | null => {
  if (value && !isValidHex(value)) {
    return 'Data must be valid hex (0x prefixed)'
  }
  return null
}

export const validateJson = (value: string): string | null => {
  if (value && !isValidJson(value)) {
    return 'Invalid JSON format'
  }
  return null
}

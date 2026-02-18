import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseEther, isAddress } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from '../config'
import { useWallet } from '../hooks/useWallet'

type FormData = {
  targetContract: string
  forkBlock: string
  bountyPool: string
  maxPayout: string
  mode: 0 | 1
  commitDeadlineHours: string
  revealDeadlineHours: string
  maxAttackerSeed: string
  maxWarpSeconds: string
  allowImpersonation: boolean
  disputeWindowHours: string
  criticalThreshold: string
  highThreshold: string
  mediumThreshold: string
  lowThreshold: string
}

const initialFormData: FormData = {
  targetContract: '',
  forkBlock: '0',
  bountyPool: '',
  maxPayout: '',
  mode: 0,
  commitDeadlineHours: '168',
  revealDeadlineHours: '336',
  maxAttackerSeed: '10',
  maxWarpSeconds: '86400',
  allowImpersonation: false,
  disputeWindowHours: '48',
  criticalThreshold: '10',
  highThreshold: '5',
  mediumThreshold: '2',
  lowThreshold: '0.5'
}

const STEPS = ['BASICS', 'BOUNTY', 'RULES', 'THRESHOLDS', 'REVIEW']

export function CreateProject() {
  const navigate = useNavigate()
  const { isConnected, address, connect, walletClient } = useWallet()
  
  const [activeStep, setActiveStep] = useState(0)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {}

    switch (step) {
      case 0:
        if (!formData.targetContract) {
          errors.targetContract = 'Target contract address is required'
        } else if (!isAddress(formData.targetContract)) {
          errors.targetContract = 'Invalid Ethereum address'
        }
        if (formData.forkBlock && isNaN(Number(formData.forkBlock))) {
          errors.forkBlock = 'Must be a valid block number'
        }
        break

      case 1:
        if (!formData.bountyPool || Number(formData.bountyPool) <= 0) {
          errors.bountyPool = 'Bounty pool must be greater than 0 ETH'
        }
        if (!formData.maxPayout || Number(formData.maxPayout) <= 0) {
          errors.maxPayout = 'Max payout must be greater than 0 ETH'
        }
        if (Number(formData.maxPayout) > Number(formData.bountyPool)) {
          errors.maxPayout = 'Max payout cannot exceed bounty pool'
        }
        if (!formData.commitDeadlineHours || Number(formData.commitDeadlineHours) <= 0) {
          errors.commitDeadlineHours = 'Commit deadline must be greater than 0 hours'
        }
        if (!formData.revealDeadlineHours || Number(formData.revealDeadlineHours) <= 0) {
          errors.revealDeadlineHours = 'Reveal deadline must be greater than 0 hours'
        }
        if (Number(formData.revealDeadlineHours) <= Number(formData.commitDeadlineHours)) {
          errors.revealDeadlineHours = 'Reveal deadline must be after commit deadline'
        }
        break

      case 2:
        if (!formData.maxAttackerSeed || Number(formData.maxAttackerSeed) < 0) {
          errors.maxAttackerSeed = 'Max attacker seed must be 0 or greater'
        }
        if (!formData.maxWarpSeconds || Number(formData.maxWarpSeconds) < 0) {
          errors.maxWarpSeconds = 'Max warp seconds must be 0 or greater'
        }
        if (!formData.disputeWindowHours || Number(formData.disputeWindowHours) <= 0) {
          errors.disputeWindowHours = 'Dispute window must be greater than 0 hours'
        }
        break

      case 3:
        if (!formData.criticalThreshold || Number(formData.criticalThreshold) <= 0) {
          errors.criticalThreshold = 'Critical threshold must be greater than 0'
        }
        if (!formData.highThreshold || Number(formData.highThreshold) <= 0) {
          errors.highThreshold = 'High threshold must be greater than 0'
        }
        if (!formData.mediumThreshold || Number(formData.mediumThreshold) <= 0) {
          errors.mediumThreshold = 'Medium threshold must be greater than 0'
        }
        if (!formData.lowThreshold || Number(formData.lowThreshold) <= 0) {
          errors.lowThreshold = 'Low threshold must be greater than 0'
        }
        if (Number(formData.lowThreshold) >= Number(formData.mediumThreshold)) {
          errors.lowThreshold = 'Low must be less than medium'
        }
        if (Number(formData.mediumThreshold) >= Number(formData.highThreshold)) {
          errors.mediumThreshold = 'Medium must be less than high'
        }
        if (Number(formData.highThreshold) >= Number(formData.criticalThreshold)) {
          errors.highThreshold = 'High must be less than critical'
        }
        break
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    setActiveStep(prev => prev - 1)
  }

  const handleSubmit = async () => {
    if (!isConnected || !walletClient) {
      setTxError('Wallet not connected')
      return
    }

    if (!validateStep(3)) {
      setActiveStep(3)
      return
    }

    setIsSubmitting(true)
    setTxError(null)
    setTxHash(null)

    try {
      const now = Math.floor(Date.now() / 1000)
      const commitDeadline = BigInt(now + Number(formData.commitDeadlineHours) * 3600)
      const revealDeadline = BigInt(now + Number(formData.revealDeadlineHours) * 3600)
      const disputeWindow = BigInt(Number(formData.disputeWindowHours) * 3600)

      const hash = await walletClient.writeContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'registerProjectV2',
        chain: CHAIN,
        account: address,
        value: parseEther(formData.bountyPool),
        args: [
          formData.targetContract as `0x${string}`,
          parseEther(formData.maxPayout),
          BigInt(formData.forkBlock || 0),
          formData.mode,
          commitDeadline,
          revealDeadline,
          disputeWindow,
          {
            maxAttackerSeedWei: parseEther(formData.maxAttackerSeed),
            maxWarpSeconds: BigInt(formData.maxWarpSeconds),
            allowImpersonation: formData.allowImpersonation,
            thresholds: {
              criticalDrainWei: parseEther(formData.criticalThreshold),
              highDrainWei: parseEther(formData.highThreshold),
              mediumDrainWei: parseEther(formData.mediumThreshold),
              lowDrainWei: parseEther(formData.lowThreshold)
            }
          }
        ]
      })

      setTxHash(hash)

      setTimeout(() => {
        navigate('/explorer')
      }, 3000)

    } catch (err: any) {
      console.error('Transaction failed:', err)
      setTxError(err?.shortMessage || err?.message || 'Transaction failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStepIndicator = () => (
    <div className="wizard-steps">
      {STEPS.map((step, index) => (
        <div key={step} className="wizard-step">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div 
              className={`wizard-step-number ${index < activeStep ? 'completed' : ''} ${index === activeStep ? 'active' : ''}`}
            >
              {index < activeStep ? '✓' : index + 1}
            </div>
            <span 
              className={`wizard-step-label ${index === activeStep ? 'active' : ''}`}
              style={{ 
                color: index <= activeStep ? 'var(--color-primary)' : 'var(--color-text-dim)',
                marginLeft: '0.5rem'
              }}
            >
              {step}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div 
              className="wizard-connector"
              style={{ 
                background: index < activeStep ? 'var(--color-primary)' : 'var(--color-text-dim)',
                margin: '0 0.75rem'
              }}
            />
          )}
        </div>
      ))}
    </div>
  )

  const renderBasicsStep = () => (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
        // STEP_01: BASICS
      </h3>
      
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          TARGET CONTRACT ADDRESS *
        </label>
        <input
          type="text"
          value={formData.targetContract}
          onChange={(e) => updateField('targetContract', e.target.value)}
          placeholder="0x..."
          style={{ 
            width: '100%',
            borderColor: validationErrors.targetContract ? 'var(--color-error)' : undefined
          }}
        />
        {validationErrors.targetContract && (
          <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
            {validationErrors.targetContract}
          </span>
        )}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          FORK BLOCK (0 = LATEST)
        </label>
        <input
          type="number"
          value={formData.forkBlock}
          onChange={(e) => updateField('forkBlock', e.target.value)}
          placeholder="0"
          min="0"
          style={{ 
            width: '100%',
            borderColor: validationErrors.forkBlock ? 'var(--color-error)' : undefined
          }}
        />
        {validationErrors.forkBlock && (
          <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
            {validationErrors.forkBlock}
          </span>
        )}
        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
          Block number to fork from. Use 0 for the latest block.
        </span>
      </div>
    </div>
  )

  const renderBountyStep = () => (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
        // STEP_02: BOUNTY CONFIG
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            BOUNTY POOL (ETH) *
          </label>
          <input
            type="number"
            step="0.001"
            value={formData.bountyPool}
            onChange={(e) => updateField('bountyPool', e.target.value)}
            placeholder="1.0"
            style={{ 
              width: '100%',
              borderColor: validationErrors.bountyPool ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.bountyPool && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.bountyPool}
            </span>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            MAX PAYOUT PER BUG (ETH) *
          </label>
          <input
            type="number"
            step="0.001"
            value={formData.maxPayout}
            onChange={(e) => updateField('maxPayout', e.target.value)}
            placeholder="0.5"
            style={{ 
              width: '100%',
              borderColor: validationErrors.maxPayout ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.maxPayout && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.maxPayout}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          COMPETITION MODE *
        </label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            cursor: 'pointer',
            padding: '0.75rem 1rem',
            border: `1px solid ${formData.mode === 0 ? 'var(--color-primary)' : 'var(--color-text-dim)'}`,
            background: formData.mode === 0 ? 'rgba(0, 255, 157, 0.1)' : 'transparent'
          }}>
            <input
              type="radio"
              name="mode"
              checked={formData.mode === 0}
              onChange={() => updateField('mode', 0)}
            />
            <span style={{ fontWeight: formData.mode === 0 ? 'bold' : 'normal', color: formData.mode === 0 ? 'var(--color-primary)' : 'var(--color-text)' }}>
              UNIQUE
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
              First valid reveal wins
            </span>
          </label>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            cursor: 'pointer',
            padding: '0.75rem 1rem',
            border: `1px solid ${formData.mode === 1 ? 'var(--color-secondary)' : 'var(--color-text-dim)'}`,
            background: formData.mode === 1 ? 'rgba(0, 240, 255, 0.1)' : 'transparent'
          }}>
            <input
              type="radio"
              name="mode"
              checked={formData.mode === 1}
              onChange={() => updateField('mode', 1)}
            />
            <span style={{ fontWeight: formData.mode === 1 ? 'bold' : 'normal', color: formData.mode === 1 ? 'var(--color-secondary)' : 'var(--color-text)' }}>
              MULTI
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
              Batch verification
            </span>
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            COMMIT DEADLINE (HOURS) *
          </label>
          <input
            type="number"
            value={formData.commitDeadlineHours}
            onChange={(e) => updateField('commitDeadlineHours', e.target.value)}
            placeholder="168"
            min="1"
            style={{ 
              width: '100%',
              borderColor: validationErrors.commitDeadlineHours ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.commitDeadlineHours && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.commitDeadlineHours}
            </span>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            REVEAL DEADLINE (HOURS) *
          </label>
          <input
            type="number"
            value={formData.revealDeadlineHours}
            onChange={(e) => updateField('revealDeadlineHours', e.target.value)}
            placeholder="336"
            min="1"
            style={{ 
              width: '100%',
              borderColor: validationErrors.revealDeadlineHours ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.revealDeadlineHours && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.revealDeadlineHours}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  const renderRulesStep = () => (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
        // STEP_03: VERIFICATION RULES
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            MAX ATTACKER SEED (ETH) *
          </label>
          <input
            type="number"
            step="0.1"
            value={formData.maxAttackerSeed}
            onChange={(e) => updateField('maxAttackerSeed', e.target.value)}
            placeholder="10"
            min="0"
            style={{ 
              width: '100%',
              borderColor: validationErrors.maxAttackerSeed ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.maxAttackerSeed && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.maxAttackerSeed}
            </span>
          )}
          <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
            Maximum ETH attacker can give themselves in setup
          </span>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            MAX WARP SECONDS *
          </label>
          <input
            type="number"
            value={formData.maxWarpSeconds}
            onChange={(e) => updateField('maxWarpSeconds', e.target.value)}
            placeholder="86400"
            min="0"
            style={{ 
              width: '100%',
              borderColor: validationErrors.maxWarpSeconds ? 'var(--color-error)' : undefined
            }}
          />
          {validationErrors.maxWarpSeconds && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {validationErrors.maxWarpSeconds}
            </span>
          )}
          <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
            Maximum time the PoC can warp forward (0 = unlimited)
          </span>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          cursor: 'pointer',
          padding: '1rem',
          border: `1px solid ${formData.allowImpersonation ? 'var(--color-primary)' : 'var(--color-text-dim)'}`,
          background: formData.allowImpersonation ? 'rgba(0, 255, 157, 0.1)' : 'transparent'
        }}>
          <input
            type="checkbox"
            checked={formData.allowImpersonation}
            onChange={(e) => updateField('allowImpersonation', e.target.checked)}
            style={{ width: 'auto' }}
          />
          <div>
            <span style={{ fontWeight: formData.allowImpersonation ? 'bold' : 'normal' }}>
              ALLOW IMPERSONATION
            </span>
            <p style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
              Allow PoC to impersonate arbitrary addresses (e.g., for governance attacks)
            </p>
          </div>
        </label>
      </div>

      <div style={{ marginTop: '1.5rem', maxWidth: '300px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          DISPUTE WINDOW (HOURS) *
        </label>
        <input
          type="number"
          value={formData.disputeWindowHours}
          onChange={(e) => updateField('disputeWindowHours', e.target.value)}
          placeholder="48"
          min="1"
          style={{ 
            width: '100%',
            borderColor: validationErrors.disputeWindowHours ? 'var(--color-error)' : undefined
          }}
        />
        {validationErrors.disputeWindowHours && (
          <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
            {validationErrors.disputeWindowHours}
          </span>
        )}
        <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
          Time for project owner to dispute AI verdicts
        </span>
      </div>
    </div>
  )

  const renderThresholdsStep = () => (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
        // STEP_04: SEVERITY THRESHOLDS
      </h3>
      
      <p style={{ color: 'var(--color-text-dim)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        Define ETH drain amounts that determine vulnerability severity. Higher severity = higher payout.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 1fr auto', 
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          border: '1px solid #ff003c',
          background: 'rgba(255, 0, 60, 0.05)'
        }}>
          <span style={{ color: '#ff003c', fontWeight: 'bold' }}>CRITICAL</span>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.1"
              value={formData.criticalThreshold}
              onChange={(e) => updateField('criticalThreshold', e.target.value)}
              placeholder="10"
              min="0"
              style={{ 
                width: '100%',
                borderColor: validationErrors.criticalThreshold ? 'var(--color-error)' : undefined
              }}
            />
            {validationErrors.criticalThreshold && (
              <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.criticalThreshold}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>ETH</span>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 1fr auto', 
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          border: '1px solid #ff8800',
          background: 'rgba(255, 136, 0, 0.05)'
        }}>
          <span style={{ color: '#ff8800', fontWeight: 'bold' }}>HIGH</span>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.1"
              value={formData.highThreshold}
              onChange={(e) => updateField('highThreshold', e.target.value)}
              placeholder="5"
              min="0"
              style={{ 
                width: '100%',
                borderColor: validationErrors.highThreshold ? 'var(--color-error)' : undefined
              }}
            />
            {validationErrors.highThreshold && (
              <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.highThreshold}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>ETH</span>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 1fr auto', 
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          border: '1px solid #ffff00',
          background: 'rgba(255, 255, 0, 0.05)'
        }}>
          <span style={{ color: '#ffff00', fontWeight: 'bold' }}>MEDIUM</span>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.1"
              value={formData.mediumThreshold}
              onChange={(e) => updateField('mediumThreshold', e.target.value)}
              placeholder="2"
              min="0"
              style={{ 
                width: '100%',
                borderColor: validationErrors.mediumThreshold ? 'var(--color-error)' : undefined
              }}
            />
            {validationErrors.mediumThreshold && (
              <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.mediumThreshold}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>ETH</span>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 1fr auto', 
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          border: '1px solid #88ff88',
          background: 'rgba(136, 255, 136, 0.05)'
        }}>
          <span style={{ color: '#88ff88', fontWeight: 'bold' }}>LOW</span>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.1"
              value={formData.lowThreshold}
              onChange={(e) => updateField('lowThreshold', e.target.value)}
              placeholder="0.5"
              min="0"
              style={{ 
                width: '100%',
                borderColor: validationErrors.lowThreshold ? 'var(--color-error)' : undefined
              }}
            />
            {validationErrors.lowThreshold && (
              <span style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {validationErrors.lowThreshold}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>ETH</span>
        </div>
      </div>
    </div>
  )

  const renderReviewStep = () => (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
        // STEP_05: REVIEW & SUBMIT
      </h3>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{ padding: '1rem', border: '1px solid var(--color-bg-light)', background: 'rgba(255,255,255,0.02)' }}>
          <h4 style={{ color: 'var(--color-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            [BASICS]
          </h4>
          <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>TARGET: </span>
              <span style={{ color: 'var(--color-text)' }}>{formData.targetContract || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>FORK_BLOCK: </span>
              <span>{formData.forkBlock || '0 (latest)'}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem', border: '1px solid var(--color-bg-light)', background: 'rgba(255,255,255,0.02)' }}>
          <h4 style={{ color: 'var(--color-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            [BOUNTY]
          </h4>
          <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>POOL: </span>
              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{formData.bountyPool} ETH</span>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>MAX_PAYOUT: </span>
              <span>{formData.maxPayout} ETH</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>MODE: </span>
              <span style={{ color: formData.mode === 0 ? 'var(--color-primary)' : 'var(--color-secondary)', fontWeight: 'bold' }}>
                {formData.mode === 0 ? 'UNIQUE' : 'MULTI'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem', border: '1px solid var(--color-bg-light)', background: 'rgba(255,255,255,0.02)' }}>
          <h4 style={{ color: 'var(--color-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            [RULES]
          </h4>
          <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>MAX_SEED: </span>
              <span>{formData.maxAttackerSeed} ETH</span>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>MAX_WARP: </span>
              <span>{formData.maxWarpSeconds}s</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>IMPERSONATE: </span>
              <span style={{ color: formData.allowImpersonation ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {formData.allowImpersonation ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem', border: '1px solid var(--color-bg-light)', background: 'rgba(255,255,255,0.02)' }}>
          <h4 style={{ color: 'var(--color-secondary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            [THRESHOLDS]
          </h4>
          <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: '#ff003c' }}>CRITICAL: </span>
              <span>{formData.criticalThreshold} ETH</span>
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: '#ff8800' }}>HIGH: </span>
              <span>{formData.highThreshold} ETH</span>
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: '#ffff00' }}>MEDIUM: </span>
              <span>{formData.mediumThreshold} ETH</span>
            </div>
            <div>
              <span style={{ color: '#88ff88' }}>LOW: </span>
              <span>{formData.lowThreshold} ETH</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ 
        padding: '1rem', 
        border: '1px solid var(--color-primary)', 
        background: 'rgba(0, 255, 157, 0.05)',
        marginBottom: '2rem'
      }}>
        <h4 style={{ color: 'var(--color-primary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          [TIMELINE]
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>COMMIT DEADLINE: </span>
            <span>{formData.commitDeadlineHours}h from now</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>REVEAL DEADLINE: </span>
            <span>{formData.revealDeadlineHours}h from now</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>DISPUTE WINDOW: </span>
            <span>{formData.disputeWindowHours}h</span>
          </div>
        </div>
      </div>

      {!isConnected && (
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid var(--color-error)', 
          background: 'rgba(255, 0, 60, 0.1)',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>
            Wallet not connected. Connect your wallet to submit.
          </p>
          <button onClick={connect} className="btn-cyber">
            CONNECT WALLET
          </button>
        </div>
      )}

      {txHash && (
        <div style={{ 
          padding: '1rem', 
          border: '1px solid var(--color-primary)', 
          background: 'rgba(0, 255, 157, 0.1)',
          marginBottom: '1.5rem'
        }}>
          <p style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            ✓ TRANSACTION SUBMITTED
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
            <span style={{ color: 'var(--color-text-dim)' }}>TX_HASH: </span>
            <a 
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-secondary)' }}
            >
              {txHash}
            </a>
          </p>
          <p style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Redirecting to explorer...
          </p>
        </div>
      )}

      {txError && (
        <div style={{ 
          padding: '1rem', 
          border: '1px solid var(--color-error)', 
          background: 'rgba(255, 0, 60, 0.1)',
          marginBottom: '1.5rem'
        }}>
          <p style={{ color: 'var(--color-error)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            ✗ TRANSACTION FAILED
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text)', marginTop: '0.5rem' }}>
            {txError}
          </p>
        </div>
      )}

      {isConnected && (
        <div style={{ 
          padding: '0.75rem', 
          border: '1px solid var(--color-bg-light)',
          marginBottom: '1.5rem',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-mono)'
        }}>
          <span style={{ color: 'var(--color-text-dim)' }}>SUBMITTING FROM: </span>
          <span style={{ color: 'var(--color-secondary)' }}>{address}</span>
        </div>
      )}
    </div>
  )

  const renderCurrentStep = () => {
    switch (activeStep) {
      case 0: return renderBasicsStep()
      case 1: return renderBountyStep()
      case 2: return renderRulesStep()
      case 3: return renderThresholdsStep()
      case 4: return renderReviewStep()
      default: return null
    }
  }

  return (
    <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ marginBottom: '1rem', flexShrink: 0 }}>
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-primary)'
          }}>
            CREATE PROJECT
          </h1>
          <div style={{ 
            height: '2px', 
            background: 'linear-gradient(90deg, var(--color-primary), transparent)',
            width: '150px',
            margin: '0.25rem 0 0.5rem'
          }} />
          <p style={{ 
            color: 'var(--color-text-dim)', 
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem'
          }}>
            &gt; Register a new bounty project on-chain
          </p>
        </header>

        <div style={{ flexShrink: 0, marginBottom: '1rem' }}>
          {renderStepIndicator()}
        </div>

        <div style={{ 
          background: 'rgba(255, 255, 255, 0.02)', 
          padding: '1rem', 
          border: '1px solid var(--color-bg-light)',
          flex: 1,
          overflow: 'auto'
        }}>
          {renderCurrentStep()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexShrink: 0, marginTop: '1rem' }}>
          <button
            onClick={handleBack}
            disabled={activeStep === 0 || isSubmitting}
            className="btn-cyber"
            style={{ 
              opacity: activeStep === 0 ? 0.5 : 1,
              cursor: activeStep === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            [ PREVIOUS ]
          </button>

          {activeStep < STEPS.length - 1 ? (
            <button onClick={handleNext} className="btn-cyber">
              [ NEXT ]
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isConnected || isSubmitting || !!txHash}
              className="btn-cyber"
              style={{ 
                opacity: (!isConnected || isSubmitting || txHash) ? 0.5 : 1,
                minWidth: '180px'
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" style={{ marginRight: '0.5rem' }} />
                  SUBMITTING...
                </>
              ) : txHash ? (
                '✓ SUBMITTED'
              ) : (
                '[ SUBMIT PROJECT ]'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateProject

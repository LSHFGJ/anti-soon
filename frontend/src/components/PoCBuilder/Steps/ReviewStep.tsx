import React, { useState, useEffect } from 'react'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
import { useCommitReveal } from '../../../hooks/useCommitReveal'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ReviewStepProps {
  pocJson: string
  isConnected: boolean
  isSubmitting: boolean
  submissionHash: string
  error: string | null
  onConnect: () => void
  onSubmit: () => void
  onBack: () => void
  projectId?: bigint
  useV2?: boolean
}

const Spinner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: '0.75rem',
    padding: '1rem',
    color: 'var(--color-secondary)'
  }}>
    <span className="spinner"></span>
    <span style={{ fontFamily: 'var(--font-mono)' }}>{children}</span>
  </div>
)

const CheckIcon: React.FC = () => (
  <span style={{ color: 'var(--color-primary)', marginRight: '0.5rem' }}>✓</span>
)

export const ReviewStep: React.FC<ReviewStepProps> = React.memo(({ 
  pocJson, 
  isConnected, 
  isSubmitting, 
  submissionHash, 
  error, 
  onConnect, 
  onSubmit, 
  onBack,
  projectId = 1n,
  useV2 = true
}) => {
  const commitReveal = useCommitReveal(projectId, pocJson)
  const [showV1Fallback, setShowV1Fallback] = useState(false)
  const { success, error: toastError } = useToast()
  const [prevPhase, setPrevPhase] = useState(commitReveal.state.phase)

  useEffect(() => {
    const { state } = commitReveal
    if (prevPhase !== state.phase) {
      if (state.phase === 'committed') {
        success({
          title: 'PoC Committed',
          description: 'Your encrypted PoC has been submitted successfully.',
        })
      } else if (state.phase === 'revealed') {
        success({
          title: 'PoC Revealed',
          description: 'Verification is now in progress.',
        })
      } else if (state.phase === 'idle' && state.error) {
        toastError({
          title: 'Transaction Failed',
          description: state.error,
        })
      }
      setPrevPhase(state.phase)
    }
  }, [commitReveal.state.phase, commitReveal.state.error, success, toastError, prevPhase])

  useEffect(() => {
    if (submissionHash && !useV2) {
      success({
        title: 'PoC Transmitted (V1)',
        description: 'Transaction submitted successfully.',
      })
    }
  }, [submissionHash, useV2, success])

  useEffect(() => {
    if (error && !useV2) {
      toastError({
        title: 'Submission Error',
        description: error,
      })
    }
  }, [error, useV2, toastError])

  const renderV2Flow = () => {
    const { state, commit, reveal, reset } = commitReveal

    return (
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{
          border: '1px solid var(--color-text-dim)',
          padding: '1rem',
          marginBottom: '1rem',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            color: 'var(--color-text-dim)'
          }}>
            <span style={{ 
              color: state.phase !== 'idle' ? 'var(--color-primary)' : 'var(--color-text)',
              fontWeight: state.phase !== 'idle' && state.phase !== 'encrypting' ? 'bold' : 'normal'
            }}>
              1. COMMIT
            </span>
            <span style={{ color: 'var(--color-text-dim)' }}>→</span>
            <span style={{ 
              color: ['committed', 'revealing', 'revealed'].includes(state.phase) ? 'var(--color-primary)' : 'var(--color-text)',
              fontWeight: state.phase === 'revealed' ? 'bold' : 'normal'
            }}>
              2. REVEAL
            </span>
            <span style={{ color: 'var(--color-text-dim)' }}>→</span>
            <span style={{ 
              color: state.phase === 'revealed' ? 'var(--color-primary)' : 'var(--color-text-dim)'
            }}>
              VERIFY
            </span>
          </div>
        </div>

        {state.error && (
          <div style={{ 
            color: 'var(--color-error)', 
            border: '1px solid var(--color-error)', 
            padding: '1rem', 
            marginBottom: '1rem',
            background: 'rgba(255,0,0,0.05)'
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>ERROR:</div>
            <div style={{ fontSize: '0.9rem' }}>{state.error}</div>
            <button
              onClick={reset}
              style={{
                marginTop: '0.75rem',
                background: 'transparent',
                border: '1px solid var(--color-error)',
                color: 'var(--color-error)',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem'
              }}
            >
              [ RESET ]
            </button>
          </div>
        )}

        {state.phase === 'idle' && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {!isConnected ? (
              <button 
                onClick={onConnect}
                style={{ 
                  padding: '0.75rem 2rem', 
                  background: 'var(--color-secondary)', 
                  color: 'var(--color-bg)', 
                  border: 'none', 
                  cursor: 'pointer', 
                  fontFamily: 'var(--font-mono)'
                }}
              >
                [ CONNECT_WALLET ]
              </button>
            ) : (
              <>
                <button 
                  onClick={commit}
                  style={{ 
                    padding: '0.75rem 2rem', 
                    background: 'var(--color-primary)', 
                    color: 'var(--color-bg)', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  [ 1. COMMIT_ENCRYPTED_POC ]
                </button>
                <button 
                  onClick={() => setShowV1Fallback(true)}
                  style={{ 
                    padding: '0.75rem 1.5rem', 
                    background: 'transparent', 
                    color: 'var(--color-text-dim)', 
                    border: '1px solid var(--color-text-dim)', 
                    cursor: 'pointer', 
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem'
                  }}
                >
                  USE V1 (LEGACY)
                </button>
              </>
            )}
          </div>
        )}

        {state.phase === 'encrypting' && (
          <Spinner>Encrypting PoC JSON...</Spinner>
        )}

        {state.phase === 'uploading' && (
          <Spinner>Uploading ciphertext to IPFS...</Spinner>
        )}

        {state.phase === 'committing' && (
          <Spinner>Committing to blockchain...</Spinner>
        )}

        {state.phase === 'committed' && (
          <div style={{ 
            padding: '1.5rem', 
            border: '1px solid var(--color-primary)', 
            background: 'rgba(0,255,136,0.05)',
            marginBottom: '1rem'
          }}>
            <div style={{ 
              color: 'var(--color-primary)', 
              fontWeight: 'bold', 
              fontFamily: 'var(--font-mono)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckIcon /> PHASE_1_COMPLETE
            </div>
            
            <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>Submission ID: </span>
              <span style={{ color: 'var(--color-secondary)', fontFamily: 'var(--font-mono)' }}>
                {state.submissionId?.toString()}
              </span>
            </div>

            {state.commitTxHash && (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--color-text-dim)' }}>Commit TX: </span>
                <code style={{ color: 'var(--color-secondary)', fontSize: '0.8rem' }}>
                  {state.commitTxHash}
                </code>
              </div>
            )}

            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: 'rgba(0,0,0,0.3)', 
              borderRadius: '4px',
              fontSize: '0.8rem',
              color: 'var(--color-text-dim)'
            }}>
              Your PoC is encrypted on IPFS. Reveal when ready to trigger verification.
              The decryption key and salt are stored locally.
            </div>

            <button 
              onClick={reveal}
              style={{ 
                marginTop: '1rem',
                padding: '0.75rem 2rem', 
                background: 'var(--color-secondary)', 
                color: 'var(--color-bg)', 
                border: 'none', 
                cursor: 'pointer', 
                fontFamily: 'var(--font-mono)'
              }}
            >
              [ 2. REVEAL_POC ]
            </button>
          </div>
        )}

        {state.phase === 'revealing' && (
          <Spinner>Revealing decryption key...</Spinner>
        )}

        {state.phase === 'revealed' && (
          <div style={{ 
            padding: '1.5rem', 
            border: '1px solid var(--color-primary)', 
            background: 'rgba(0,255,136,0.1)',
            marginBottom: '1rem'
          }}>
            <div style={{ 
              color: 'var(--color-primary)', 
              fontWeight: 'bold', 
              fontFamily: 'var(--font-mono)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckIcon /> POC_REVEALED
            </div>
            
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', marginBottom: '1rem' }}>
              CRE verification is now in progress. The network will:
            </div>
            
            <ol style={{ 
              color: 'var(--color-text-dim)', 
              margin: 0, 
              paddingLeft: '1.5rem',
              fontSize: '0.85rem'
            }}>
              <li>Decrypt your PoC using the revealed key</li>
              <li>Create Tenderly fork at specified block</li>
              <li>Execute the exploit in sandbox</li>
              <li>Measure impact and classify severity</li>
              <li>Auto-release bounty if valid</li>
            </ol>

            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: 'var(--color-secondary)', 
              color: 'var(--color-bg)',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem'
            }}>
              <a 
                href={`/submission/${state.submissionId}`}
                style={{ color: 'var(--color-bg)', textDecoration: 'none' }}
              >
                VIEW VERIFICATION STATUS →
              </a>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderV1Flow = () => (
    <>
      {error && (
        <div style={{ 
          color: 'var(--color-error)', 
          border: '1px solid var(--color-error)', 
          padding: '1rem', 
          marginBottom: '1rem',
          background: 'rgba(255,0,0,0.05)'
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>ERROR:</div>
          <div style={{ fontSize: '0.9rem' }}>{error}</div>
        </div>
      )}

      {submissionHash && (
        <div style={{ 
          marginBottom: '1rem', 
          padding: '1rem', 
          border: '1px solid var(--color-primary)', 
          background: 'rgba(0, 255, 136, 0.1)'
        }}>
          <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
            ✓ PoC_TRANSMITTED (V1)
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', marginBottom: '0.75rem' }}>
            Transaction Hash:
          </div>
          <code style={{ 
            fontSize: '0.8rem', 
            color: 'var(--color-secondary)', 
            background: 'rgba(0,255,136,0.1)', 
            padding: '0.5rem',
            display: 'block',
            wordBreak: 'break-all'
          }}>
            {submissionHash}
          </code>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {!isConnected ? (
          <button 
            onClick={onConnect}
            style={{ 
              padding: '0.75rem 2rem', 
              background: 'var(--color-secondary)', 
              color: 'var(--color-bg)', 
              border: 'none', 
              cursor: 'pointer', 
              fontFamily: 'var(--font-mono)'
            }}
          >
            [ CONNECT_WALLET ]
          </button>
        ) : (
          <button 
            onClick={onSubmit} 
            disabled={isSubmitting}
            style={{ 
              padding: '0.75rem 2rem', 
              background: isSubmitting ? 'var(--color-text-dim)' : 'var(--color-primary)', 
              color: 'var(--color-bg)', 
              border: 'none', 
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <span className="spinner"></span> TRANSMITTING...
              </span>
            ) : '[ SUBMIT_POC (V1) ]'}
          </button>
        )}
        <button 
          onClick={() => setShowV1Fallback(false)}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'transparent', 
            color: 'var(--color-text-dim)', 
            border: '1px solid var(--color-text-dim)', 
            cursor: 'pointer', 
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem'
          }}
        >
          BACK TO V2
        </button>
      </div>
    </>
  )

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.review} />
      
      <Card className="bg-card/50 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-sm font-mono text-secondary">
            GENERATED_POC.JSON
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            {pocJson.length} bytes
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          <pre className="bg-black/50 p-4 border border-primary/20 rounded-md overflow-auto text-xs font-mono text-primary max-h-[400px]">
            {pocJson}
          </pre>
        </CardContent>
      </Card>

      {useV2 && !showV1Fallback ? renderV2Flow() : renderV1Flow()}

      <div className="mt-6">
        <Button 
          variant="outline"
          onClick={onBack}
          className="font-mono"
        >
          &lt;&lt; BACK
        </Button>
      </div>
    </div>
  )
})

ReviewStep.displayName = 'ReviewStep'

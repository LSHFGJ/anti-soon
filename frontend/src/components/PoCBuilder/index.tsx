import React, { useMemo, useEffect, useCallback, useState } from 'react'
import { usePoCBuilder } from '../../hooks/usePoCBuilder'
import { usePoCSubmission } from '../../hooks/usePoCSubmission'
import { useWallet } from '../../hooks/useWallet'
import { DEMO_PROJECTS, H01_POC_TEMPLATE, DUMMYVAULT_POC_TEMPLATES } from '../../config'
import type { PoCData } from '../../types/poc'

import { TargetStep } from './Steps/TargetStep'
import { ConditionsStep } from './Steps/ConditionsStep'
import { TransactionsStep } from './Steps/TransactionsStep'
import { ImpactStep } from './Steps/ImpactStep'
import { ReviewStep } from './Steps/ReviewStep'

interface PoCBuilderProps {
  selectedProject?: typeof DEMO_PROJECTS[0] | null
}

export const PoCBuilder: React.FC<PoCBuilderProps> = ({ selectedProject }) => {
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
    submissionHash, 
    error, 
    submitPoC 
  } = usePoCSubmission()

  const { isConnected, connect } = useWallet()

  const pocJson = useMemo(() => generatePoCJSON(), [generatePoCJSON])

  const handleNext = () => setActiveStep(prev => prev + 1)
  const handleBack = () => setActiveStep(prev => prev - 1)
  const handleSubmit = () => submitPoC(pocJson)

  return (
    <section id="builder" className="container" style={{ padding: '4rem 2rem', minHeight: '100vh', borderLeft: '1px solid var(--color-text-dim)', marginLeft: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 className="text-primary">// PoC_BUILDER_V1.0</h2>
        {selectedProject && (
          <div style={{ 
            border: '1px solid var(--color-secondary)', 
            padding: '0.5rem 1rem', 
            color: 'var(--color-secondary)', 
            fontSize: '0.8rem',
            background: 'rgba(0, 255, 136, 0.05)'
          }}>
            PROJECT: {selectedProject.name.toUpperCase()}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--color-text-dim)', paddingBottom: '1rem', overflowX: 'auto' }}>
        {[1, 2, 3, 4, 5].map(step => (
          <button 
            key={step} 
            onClick={() => setActiveStep(step)}
            style={{ 
              color: activeStep === step ? 'var(--color-bg)' : 'var(--color-text-dim)',
              backgroundColor: activeStep === step ? 'var(--color-primary)' : 'transparent',
              padding: '0.5rem 1rem',
              border: '1px solid var(--color-text-dim)',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            STEP_0{step}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '2rem', border: '1px solid var(--color-text-dim)' }}>
        
        {activeStep === 1 && (
          <TargetStep 
            config={targetConfig} 
            onUpdate={updateTargetConfig} 
            onNext={handleNext} 
            onLoadExample={handleLoadExample}
          />
        )}

        {activeStep === 2 && (
          <ConditionsStep 
            conditions={conditions} 
            onAdd={addCondition} 
            onRemove={removeCondition} 
            onUpdate={updateCondition} 
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {activeStep === 3 && (
          <TransactionsStep 
            transactions={transactions} 
            onAdd={addTransaction} 
            onRemove={removeTransaction} 
            onUpdate={updateTransaction} 
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {activeStep === 4 && (
          <ImpactStep 
            config={impactConfig} 
            onUpdate={updateImpactConfig} 
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {activeStep === 5 && (
          <ReviewStep 
            pocJson={pocJson}
            isConnected={isConnected}
            isSubmitting={isSubmitting}
            submissionHash={submissionHash}
            error={error}
            onConnect={connect}
            onSubmit={handleSubmit}
            onBack={handleBack}
          />
        )}

      </div>

      {/* Template Selection Modal for DummyVault */}
      {showTemplateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-primary)',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>
              // SELECT_POC_TEMPLATE
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {Object.entries(DUMMYVAULT_POC_TEMPLATES).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => handleTemplateSelect(key)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-text-dim)',
                    padding: '1rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)'
                    e.currentTarget.style.background = 'rgba(0, 255, 136, 0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-text-dim)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{template.name}</span>
                    <span style={{
                      color: template.severity === 'HIGH' ? 'var(--color-error)' : 'var(--color-text)',
                      fontSize: '0.8rem',
                      border: `1px solid ${template.severity === 'HIGH' ? 'var(--color-error)' : 'var(--color-text-dim)'}`,
                      padding: '0.1rem 0.5rem'
                    }}>
                      {template.severity}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem', margin: 0 }}>
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTemplateModal(false)}
              style={{
                marginTop: '1.5rem',
                background: 'transparent',
                border: '1px solid var(--color-text-dim)',
                color: 'var(--color-text)',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              [ CANCEL ]
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

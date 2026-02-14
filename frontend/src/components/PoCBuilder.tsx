import React, { useState } from 'react'
import { keccak256, toHex, stringToBytes, encodeFunctionData, parseAbi } from 'viem'
import { useWallet } from '../hooks/useWallet'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_ABI } from '../config'

// Types
type ConditionType = 'setBalance' | 'setTimestamp' | 'setStorage'
type ImpactType = 'fundsDrained' | 'accessEscalation' | 'stateCorruption' | 'other'

interface Condition {
  id: string
  type: ConditionType
  target?: string
  value: string
  slot?: string
}

interface Transaction {
  id: string
  to: string
  value: string
  data: string
  functionName?: string
  args?: string
}

export const PoCBuilder: React.FC = () => {
  const { isConnected, connect, walletClient, address, publicClient } = useWallet()
  const [activeStep, setActiveStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Target
  const [targetContract, setTargetContract] = useState('')
  const [chain, setChain] = useState('Sepolia')
  const [forkBlock, setForkBlock] = useState('')
  const [abiJson, setAbiJson] = useState('')
  
  // Step 2: Conditions
  const [conditions, setConditions] = useState<Condition[]>([])
  
  // Step 3: Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([])
  
  // Step 4: Impact
  const [impactType, setImpactType] = useState<ImpactType>('fundsDrained')
  const [estimatedLoss, setEstimatedLoss] = useState('')
  const [description, setDescription] = useState('')
  
  // Step 5: Submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionHash, setSubmissionHash] = useState('')

  const addCondition = () => {
    setConditions([...conditions, { id: crypto.randomUUID(), type: 'setBalance', value: '0' }])
  }

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id))
  }

  const updateCondition = (id: string, field: keyof Condition, val: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: val } : c))
  }

  const addTransaction = () => {
    setTransactions([...transactions, { id: crypto.randomUUID(), to: targetContract, value: '0', data: '0x' }])
  }

  const removeTransaction = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id))
  }

  const updateTransaction = (id: string, field: keyof Transaction, val: string) => {
    setTransactions(transactions.map(t => t.id === id ? { ...t, [field]: val } : t))
  }

  const generatePoCJSON = () => {
    const poc = {
      target: targetContract,
      chain,
      forkBlock: parseInt(forkBlock) || 0,
      conditions: conditions.map(({ id, ...rest }) => rest),
      transactions: transactions.map(({ id, ...rest }) => rest),
      impact: {
        type: impactType,
        estimatedLoss,
        description
      },
      metadata: {
        generator: "AntiSoon v1.0",
        timestamp: Date.now()
      }
    }
    return JSON.stringify(poc, null, 2)
  }

  const handleSubmit = async () => {
    if (!isConnected || !walletClient || !publicClient || !address) {
      setError("Wallet not connected")
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const jsonString = generatePoCJSON()
      const pocHash = keccak256(toHex(jsonString))
      
      // Ideally upload to IPFS here. For now, we mock the URI.
      const mockUri = `ipfs://mock-cid-${pocHash.substring(0, 10)}`
      
      // Mock Project ID 1 for demo
      const projectId = 1n 
      
      const { request } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_ABI,
        functionName: 'submitPoC',
        args: [projectId, pocHash, mockUri]
      })

      const hash = await walletClient.writeContract(request)
      setSubmissionHash(hash)
      alert(`PoC Submitted! Tx: ${hash}`)
    } catch (e: any) {
      console.error(e)
      setError(e.message || "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section id="builder" className="container" style={{ padding: '4rem 2rem', minHeight: '100vh', borderLeft: '1px solid var(--color-text-dim)', marginLeft: '2rem' }}>
      <h2 className="text-primary" style={{ marginBottom: '2rem' }}>// PoC_BUILDER_V1.0</h2>
      
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
              fontWeight: 'bold'
            }}
          >
            STEP_0{step}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '2rem', border: '1px solid var(--color-text-dim)' }}>
        
        {/* STEP 1: TARGET */}
        {activeStep === 1 && (
          <div className="step-content">
            <h3 className="text-secondary" style={{ marginBottom: '1rem' }}>TARGET_CONFIGURATION</h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label>Target Contract Address</label>
                <input value={targetContract} onChange={e => setTargetContract(e.target.value)} placeholder="0x..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Chain</label>
                  <select value={chain} onChange={e => setChain(e.target.value)}>
                    <option value="Mainnet">Ethereum Mainnet</option>
                    <option value="Sepolia">Sepolia Testnet</option>
                    <option value="Optimism">Optimism</option>
                    <option value="Arbitrum">Arbitrum</option>
                  </select>
                </div>
                <div>
                  <label>Fork Block Number</label>
                  <input value={forkBlock} onChange={e => setForkBlock(e.target.value)} placeholder="Latest" type="number" />
                </div>
              </div>
              <div>
                <label>Contract ABI (JSON)</label>
                <textarea 
                  rows={5} 
                  value={abiJson} 
                  onChange={e => setAbiJson(e.target.value)}
                  placeholder='[{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]' 
                />
              </div>
            </div>
            <div style={{ marginTop: '2rem', textAlign: 'right' }}>
               <button className="btn-cyber" onClick={() => setActiveStep(2)}>NEXT &gt;&gt;</button>
            </div>
          </div>
        )}

        {/* STEP 2: CONDITIONS */}
        {activeStep === 2 && (
          <div className="step-content">
            <h3 className="text-secondary" style={{ marginBottom: '1rem' }}>INITIAL_CONDITIONS</h3>
            <p style={{ color: 'var(--color-text-dim)', marginBottom: '1rem' }}>Set the state of the chain before attack.</p>
            
            {conditions.map((cond, idx) => (
              <div key={cond.id} style={{ border: '1px solid var(--color-text-dim)', padding: '1rem', marginBottom: '1rem', position: 'relative' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '0.5rem' }}>
                  <select value={cond.type} onChange={e => updateCondition(cond.id, 'type', e.target.value)}>
                    <option value="setBalance">Set Balance (ETH)</option>
                    <option value="setTimestamp">Set Timestamp</option>
                    <option value="setStorage">Set Storage Slot</option>
                  </select>
                  <input 
                    placeholder="Value (e.g. 1000000000000000000)" 
                    value={cond.value} 
                    onChange={e => updateCondition(cond.id, 'value', e.target.value)} 
                  />
                </div>
                {cond.type === 'setBalance' && (
                   <input 
                    placeholder="Address (Target)" 
                    value={cond.target || ''} 
                    onChange={e => updateCondition(cond.id, 'target', e.target.value)} 
                  />
                )}
                 {cond.type === 'setStorage' && (
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                     <input 
                      placeholder="Contract Address" 
                      value={cond.target || ''} 
                      onChange={e => updateCondition(cond.id, 'target', e.target.value)} 
                    />
                    <input 
                      placeholder="Slot (Hex)" 
                      value={cond.slot || ''} 
                      onChange={e => updateCondition(cond.id, 'slot', e.target.value)} 
                    />
                   </div>
                )}
                <button 
                  onClick={() => removeCondition(cond.id)}
                  style={{ position: 'absolute', top: '5px', right: '5px', color: 'var(--color-error)', fontWeight: 'bold' }}
                >
                  [x]
                </button>
              </div>
            ))}
            
            <button onClick={addCondition} style={{ color: 'var(--color-primary)', border: '1px dashed var(--color-primary)', padding: '0.5rem', width: '100%', marginBottom: '2rem' }}>
              + ADD_CONDITION
            </button>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <button className="btn-cyber" onClick={() => setActiveStep(1)}>&lt;&lt; BACK</button>
               <button className="btn-cyber" onClick={() => setActiveStep(3)}>NEXT &gt;&gt;</button>
            </div>
          </div>
        )}

        {/* STEP 3: ATTACK */}
        {activeStep === 3 && (
          <div className="step-content">
             <h3 className="text-secondary" style={{ marginBottom: '1rem' }}>ATTACK_VECTOR</h3>
             <p style={{ color: 'var(--color-text-dim)', marginBottom: '1rem' }}>Define the transactions to execute the exploit.</p>
             
             {transactions.map((tx, idx) => (
               <div key={tx.id} style={{ border: '1px solid var(--color-text-dim)', padding: '1rem', marginBottom: '1rem', position: 'relative' }}>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>To Address</label>
                    <input value={tx.to} onChange={e => updateTransaction(tx.id, 'to', e.target.value)} />
                    
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Value (ETH)</label>
                    <input value={tx.value} onChange={e => updateTransaction(tx.id, 'value', e.target.value)} />
                    
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Calldata (Hex)</label>
                    <textarea rows={2} value={tx.data} onChange={e => updateTransaction(tx.id, 'data', e.target.value)} style={{ fontFamily: 'monospace' }} />
                  </div>
                  <button 
                    onClick={() => removeTransaction(tx.id)}
                    style={{ position: 'absolute', top: '5px', right: '5px', color: 'var(--color-error)', fontWeight: 'bold' }}
                  >
                    [x]
                  </button>
               </div>
             ))}

            <button onClick={addTransaction} style={{ color: 'var(--color-primary)', border: '1px dashed var(--color-primary)', padding: '0.5rem', width: '100%', marginBottom: '2rem' }}>
              + ADD_TX
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <button className="btn-cyber" onClick={() => setActiveStep(2)}>&lt;&lt; BACK</button>
               <button className="btn-cyber" onClick={() => setActiveStep(4)}>NEXT &gt;&gt;</button>
            </div>
          </div>
        )}

        {/* STEP 4: IMPACT */}
        {activeStep === 4 && (
          <div className="step-content">
            <h3 className="text-secondary" style={{ marginBottom: '1rem' }}>IMPACT_ASSESSMENT</h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
               <div>
                 <label>Vulnerability Type</label>
                 <select value={impactType} onChange={e => setImpactType(e.target.value as ImpactType)}>
                   <option value="fundsDrained">Funds Drained</option>
                   <option value="accessEscalation">Access Escalation</option>
                   <option value="stateCorruption">State Corruption</option>
                   <option value="other">Other</option>
                 </select>
               </div>
               <div>
                 <label>Estimated Loss (ETH)</label>
                 <input type="number" value={estimatedLoss} onChange={e => setEstimatedLoss(e.target.value)} />
               </div>
               <div>
                 <label>Description</label>
                 <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the impact..." />
               </div>
            </div>
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
               <button className="btn-cyber" onClick={() => setActiveStep(3)}>&lt;&lt; BACK</button>
               <button className="btn-cyber" onClick={() => setActiveStep(5)}>REVIEW &gt;&gt;</button>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW */}
        {activeStep === 5 && (
          <div className="step-content">
             <h3 className="text-secondary" style={{ marginBottom: '1rem' }}>FINAL_VERIFICATION</h3>
             
             <pre style={{ 
               background: '#000', 
               padding: '1rem', 
               border: '1px solid var(--color-primary-dim)', 
               overflowX: 'auto',
               fontSize: '0.8rem',
               color: 'var(--color-primary)',
               marginBottom: '2rem'
             }}>
               {generatePoCJSON()}
             </pre>

             {error && (
               <div style={{ color: 'var(--color-error)', border: '1px solid var(--color-error)', padding: '1rem', marginBottom: '1rem' }}>
                 ERROR: {error}
               </div>
             )}

             <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
               {!isConnected ? (
                 <button className="btn-cyber" onClick={connect}>
                   [ CONNECT_WALLET ]
                 </button>
               ) : (
                 <button className="btn-cyber" onClick={handleSubmit} disabled={isSubmitting}>
                   {isSubmitting ? 'TRANSMITTING...' : '[ ENCRYPT_&_SUBMIT ]'}
                 </button>
               )}
             </div>
             
             {submissionHash && (
                <div style={{ marginTop: '1rem', color: 'var(--color-primary)' }}>
                  SUCCESS. HASH: {submissionHash}
                </div>
             )}
          </div>
        )}

      </div>
    </section>
  )
}

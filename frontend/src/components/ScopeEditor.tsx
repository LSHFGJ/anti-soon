import { useState } from 'react'
import type { ContractScope } from '../types'

interface DeployedContract {
  name: string
  address: string
  verified?: boolean
}

interface ScopeEditorProps {
  contracts: DeployedContract[]
  onScopeChange: (scopes: ContractScope[]) => void
  initialScopes?: ContractScope[]
}

export function ScopeEditor({ contracts, onScopeChange, initialScopes = [] }: ScopeEditorProps) {
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(
    new Set(initialScopes.map(s => s.address))
  )

  const toggleContract = (contract: DeployedContract) => {
    const newSelected = new Set(selectedAddresses)
    
    if (newSelected.has(contract.address)) {
      newSelected.delete(contract.address)
    } else {
      newSelected.add(contract.address)
    }
    
    setSelectedAddresses(newSelected)
    
    // Build scopes array
    const scopes: ContractScope[] = contracts
      .filter(c => newSelected.has(c.address))
      .map(c => ({
        address: c.address as `0x${string}`,
        name: c.name,
        ipfsCid: '', // Will be populated by CRE workflow
        verified: c.verified ?? false,
      }))
    
    onScopeChange(scopes)
  }

  const selectAll = () => {
    const allAddresses = new Set(contracts.map(c => c.address))
    setSelectedAddresses(allAddresses)
    
    const scopes: ContractScope[] = contracts.map(c => ({
      address: c.address as `0x${string}`,
      name: c.name,
      ipfsCid: '',
      verified: c.verified ?? false,
    }))
    
    onScopeChange(scopes)
  }

  const deselectAll = () => {
    setSelectedAddresses(new Set())
    onScopeChange([])
  }

  if (contracts.length === 0) {
    return (
      <div className="p-6 border border-gray-700 bg-gray-800/50 text-center text-gray-400">
        <svg className="w-8 h-8 mx-auto mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p>No deployed contracts to scope</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with select all/none */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Select which contracts should be in scope for this bounty program:
        </p>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs px-3 py-1 text-green-400 hover:text-green-300 border border-green-500/50 hover:border-green-500 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-xs px-3 py-1 text-gray-400 hover:text-gray-300 border border-gray-600 hover:border-gray-500 transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Contract List */}
      <div className="space-y-2">
        {contracts.map((contract) => {
          const isSelected = selectedAddresses.has(contract.address)
          const isVerified = contract.verified ?? false

          return (
            <button
              key={contract.address}
              onClick={() => toggleContract(contract)}
              className={`w-full text-left p-4 border transition-all duration-200 ${
                isSelected
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/50 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Checkbox */}
                <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected 
                    ? 'border-green-500 bg-green-500' 
                    : 'border-gray-600'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Contract Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{contract.name}</span>
                    {isVerified && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono truncate">{contract.address}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Selection Summary */}
      <div className="p-3 bg-gray-800/50 border border-gray-700">
        <p className="text-sm">
          <span className="text-white font-medium">{selectedAddresses.size}</span>
          <span className="text-gray-400"> of {contracts.length} contracts selected</span>
          {selectedAddresses.size === 0 && (
            <span className="text-yellow-400 ml-2">— Select at least one contract</span>
          )}
        </p>
      </div>
    </div>
  )
}

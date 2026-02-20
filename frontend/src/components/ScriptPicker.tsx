import type { DeployScript } from '../types'

interface ScriptPickerProps {
  scripts: DeployScript[]
  isLoading: boolean
  error?: string | null
  onSelect: (script: DeployScript) => void
  selectedScript?: DeployScript | null
}

export function ScriptPicker({ scripts, isLoading, error, onSelect, selectedScript }: ScriptPickerProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-gray-400">Scanning repository scripts...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-500/50 bg-red-500/10 text-red-400">
        <p className="font-medium">Error scanning repository</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (scripts.length === 0) {
    return (
      <div className="p-6 border border-yellow-500/50 bg-yellow-500/10 text-yellow-400 text-center">
        <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="font-medium">No deployment scripts found</p>
        <p className="text-sm mt-1 text-yellow-400/70">
          No Foundry scripts (*.s.sol) found in the script/ directory.
          Make sure your repository has deployment scripts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Found {scripts.length} deployment script{scripts.length !== 1 ? 's' : ''}. 
        Select one to deploy:
      </p>

      <div className="space-y-2">
        {scripts.map((script) => (
          <button
            key={script.path}
            onClick={() => onSelect(script)}
            className={`w-full text-left p-4 border transition-all duration-200 ${
              selectedScript?.path === script.path
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-medium text-white">{script.name}</span>
                  <span className="text-xs text-gray-500">{script.path}</span>
                </div>

                {script.contracts.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Contracts to deploy:</p>
                    <div className="flex flex-wrap gap-1">
                      {script.contracts.map((contract) => (
                        <span
                          key={contract}
                          className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 border border-gray-600"
                        >
                          {contract}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedScript?.path === script.path && (
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

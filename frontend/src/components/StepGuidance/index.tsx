import React, { useState } from 'react'

interface FieldGuide {
  field: string
  description: string
  example?: string
}

interface StepGuidanceProps {
  title: string
  description: string
  fields?: readonly FieldGuide[]
}

export const StepGuidance: React.FC<StepGuidanceProps> = React.memo(({ 
  title, 
  description, 
  fields 
}) => {
  const [showGuideDetails, setShowGuideDetails] = useState(false)
  const [expandedField, setExpandedField] = useState<string | null>(null)

  return (
    <div className="step-guidance-container">
      <div className="flex items-center justify-between gap-3">
        <h4 className="step-guidance-title">
          {title}
        </h4>
        {fields && fields.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowGuideDetails((prev) => !prev)}
            className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-secondary)] bg-transparent border border-[var(--color-secondary)]/40 px-2 py-1 cursor-pointer hover:bg-[var(--color-secondary-dim)] transition-all duration-200 ease-linear"
          >
            {showGuideDetails ? '[ HIDE_GUIDE ]' : '[ SHOW_GUIDE ]'}
          </button>
        ) : null}
      </div>

      <p className="step-guidance-desc mb-0">
        {description}
      </p>
      
      {fields && fields.length > 0 && showGuideDetails && (
        <div className="step-guidance-fields-wrapper">
          <div className="step-guidance-fields-title">
            Field Guide
          </div>
          {fields.map((f) => (
            <button
              type="button"
              key={f.field}
              className="step-guidance-field-item w-full border-0 bg-transparent p-0 text-left"
              onClick={() => setExpandedField(expandedField === f.field ? null : f.field)}
            >
              <div className={`step-guidance-field-header ${expandedField === f.field ? 'text-primary' : 'text-[var(--color-text)]'}`}>
                <span className="step-guidance-field-icon">
                  {expandedField === f.field ? '▼' : '▶'}
                </span>
                <code className="step-guidance-field-code">
                  {f.field}
                </code>
              </div>
              {expandedField === f.field && (
                <div className="step-guidance-field-content">
                  <div className={`step-guidance-field-desc ${f.example ? 'mb-2' : 'mb-0'}`}>
                    {f.description}
                  </div>
                  {f.example && (
                    <div className="step-guidance-field-example">
                      Example: {f.example}
                    </div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

StepGuidance.displayName = 'StepGuidance'

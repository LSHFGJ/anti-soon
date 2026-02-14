import React, { useCallback } from 'react'
import Editor from '@monaco-editor/react'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'solidity'
  height?: string | number
  placeholder?: string
  readOnly?: boolean
  label?: string
  error?: string
}

export const CodeEditor: React.FC<CodeEditorProps> = React.memo(({
  value,
  onChange,
  language = 'json',
  height = 200,
  placeholder,
  readOnly = false,
  label,
  error
}) => {
  const handleChange = useCallback((val: string | undefined) => {
    onChange(val || '')
  }, [onChange])

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    if (language === 'json') {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [],
        enableSchemaRequest: false
      })
    }

    monaco.editor.defineTheme('antisoon-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D' },
        { token: 'keyword', foreground: '00FF88' },
        { token: 'string', foreground: 'FFB000' },
        { token: 'number', foreground: '79C0FF' },
        { token: 'type', foreground: '00FF88' },
      ],
      colors: {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#151515',
        'editorLineNumber.foreground': '#505050',
        'editorCursor.foreground': '#00FF88',
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',
        'editorIndentGuide.background': '#2A2A2A',
        'editorIndentGuide.activeBackground': '#00FF8840',
      }
    })
    
    monaco.editor.setTheme('antisoon-dark')
    editor.focus()
  }, [language])

  return (
    <div className="code-editor-wrapper" style={{ marginBottom: '1rem' }}>
      {label && (
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          color: 'var(--color-text-dim)',
          fontSize: '0.85rem'
        }}>
          {label}
        </label>
      )}
      <div style={{
        border: error ? '1px solid var(--color-error)' : '1px solid var(--color-text-dim)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <Editor
          height={height}
          language={language}
          value={value || placeholder || ''}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            padding: { top: 8, bottom: 8 },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true }
          }}
          loading={
            <div style={{ 
              height, 
              background: '#0a0a0a', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)'
            }}>
              Loading editor...
            </div>
          }
        />
      </div>
      {error && (
        <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          {error}
        </span>
      )}
    </div>
  )
})

CodeEditor.displayName = 'CodeEditor'
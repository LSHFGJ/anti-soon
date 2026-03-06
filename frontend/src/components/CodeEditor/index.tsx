import React, { lazy, Suspense, useCallback } from 'react'

type MonacoEditorInstance = {
  focus: () => void
}

type MonacoApi = {
  languages: {
    json: {
      jsonDefaults: {
        setDiagnosticsOptions: (options: {
          validate: boolean
          schemas: unknown[]
          enableSchemaRequest: boolean
        }) => void
      }
    }
  }
  editor: {
    defineTheme: (name: string, theme: {
      base: string
      inherit: boolean
      rules: Array<{ token: string; foreground: string }>
      colors: Record<string, string>
    }) => void
    setTheme: (name: string) => void
  }
}

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

const EDITOR_PALETTE = {
  background: '#0a0a0a',
  foreground: '#d4d4d4',
  primary: '00FF88',
  primaryHex: '#00FF88',
  primaryDimHex: '#00FF8840',
  warning: 'FFB000',
  info: '79C0FF',
  comment: '6A737D',
  lineHighlight: '#151515',
  lineNumber: '#505050',
  selection: '#264F78',
  inactiveSelection: '#3A3D41',
  indentGuide: '#2A2A2A',
}

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

  const handleEditorMount = useCallback((editor: MonacoEditorInstance, monaco: MonacoApi) => {
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
        { token: 'comment', foreground: EDITOR_PALETTE.comment },
        { token: 'keyword', foreground: EDITOR_PALETTE.primary },
        { token: 'string', foreground: EDITOR_PALETTE.warning },
        { token: 'number', foreground: EDITOR_PALETTE.info },
        { token: 'type', foreground: EDITOR_PALETTE.primary },
      ],
      colors: {
        'editor.background': EDITOR_PALETTE.background,
        'editor.foreground': EDITOR_PALETTE.foreground,
        'editor.lineHighlightBackground': EDITOR_PALETTE.lineHighlight,
        'editorLineNumber.foreground': EDITOR_PALETTE.lineNumber,
        'editorCursor.foreground': EDITOR_PALETTE.primaryHex,
        'editor.selectionBackground': EDITOR_PALETTE.selection,
        'editor.inactiveSelectionBackground': EDITOR_PALETTE.inactiveSelection,
        'editorIndentGuide.background': EDITOR_PALETTE.indentGuide,
        'editorIndentGuide.activeBackground': EDITOR_PALETTE.primaryDimHex,
      }
    })
    
    monaco.editor.setTheme('antisoon-dark')
    editor.focus()
  }, [language])

  const loadingView = (
    <div 
      className="code-editor-loading"
      style={undefined}
    >
      Loading editor...
    </div>
  )

  return (
    <div className="code-editor-wrapper">
      {label && (
        <label className="code-editor-label">
          {label}
        </label>
      )}
      <div className={`code-editor-container ${error ? 'has-error' : ''}`}>
        <Suspense fallback={loadingView}>
          <MonacoEditor
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
            loading={loadingView}
          />
        </Suspense>
      </div>
      {error && (
        <span className="code-editor-error">
          {error}
        </span>
      )}
    </div>
  )
})

CodeEditor.displayName = 'CodeEditor'

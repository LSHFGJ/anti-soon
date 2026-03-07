import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConditionsStep } from '../components/PoCBuilder/Steps/ConditionsStep'
import { ImpactStep } from '../components/PoCBuilder/Steps/ImpactStep'
import { TargetStep } from '../components/PoCBuilder/Steps/TargetStep'
import { TransactionsStep } from '../components/PoCBuilder/Steps/TransactionsStep'
import { createMockProject } from '../test/utils'

vi.mock('../components/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, placeholder }: { value: string; onChange: (next: string) => void; placeholder?: string }) =>
    React.createElement('textarea', {
      'aria-label': 'mock-code-editor',
      value,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)
    })
}))

describe('PoC builder step latency boundaries', () => {
  it('updates target contract from the project-driven contract dropdown', () => {
    vi.useFakeTimers()

    const onUpdate = vi.fn()
    const availableProjects = [
      createMockProject({
        id: 7n,
        targetContract: '0x7777777777777777777777777777777777777777',
        forkBlock: 22000000n,
      }),
    ]

    render(
      React.createElement(TargetStep, {
        config: {
          targetContract: '',
          chain: 'Sepolia',
          forkBlock: '',
        },
        onUpdate,
        onNext: () => undefined,
        availableProjects,
        selectedProjectId: 7n,
      })
    )

    const contractSelect = screen.getAllByRole('combobox').at(1) as HTMLButtonElement
    expect(contractSelect).toBeDefined()

    act(() => {
      fireEvent.keyDown(contractSelect, { key: 'ArrowDown' })
    })

    act(() => {
      const listbox = screen.getByRole('listbox')
      fireEvent.click(within(listbox).getByText(/0x7777777777777777777777777777777777777777/i))
    })

    expect(onUpdate.mock.calls.length).toBeLessThanOrEqual(2)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onUpdate).toHaveBeenCalled()
    expect(onUpdate).toHaveBeenLastCalledWith('targetContract', '0x7777777777777777777777777777777777777777')

    vi.useRealTimers()
  })

  it('supports explorer project dropdown and syncs template-updated target fields', () => {
    const onUpdate = vi.fn()
    const onSelectProject = vi.fn()
    const availableProjects = [
      createMockProject({
        id: 7n,
        targetContract: '0x7777777777777777777777777777777777777777',
        forkBlock: 22000000n,
      }),
      createMockProject({
        id: 8n,
        targetContract: '0x8888888888888888888888888888888888888888',
        forkBlock: 23000000n,
      }),
    ]

    const initialConfig = {
      targetContract: '',
      chain: 'Sepolia',
      forkBlock: '',
    }

    const { rerender } = render(
      React.createElement(TargetStep, {
        config: initialConfig,
        onUpdate,
        onNext: () => undefined,
        availableProjects,
        selectedProjectId: 7n,
        onSelectProject,
      }),
    )

    const projectSelect = screen.getAllByRole('combobox').at(0) as HTMLButtonElement
    expect(projectSelect).toHaveTextContent('#7')

    act(() => {
      fireEvent.keyDown(projectSelect, { key: 'ArrowDown' })
    })

    act(() => {
      const listbox = screen.getByRole('listbox')
      fireEvent.click(within(listbox).getByText(/#8 ·/))
    })

    expect(onSelectProject).toHaveBeenCalledWith(8n)

    rerender(
      React.createElement(TargetStep, {
        config: {
          targetContract: '0x7777777777777777777777777777777777777777',
          chain: 'Mainnet',
          forkBlock: '22000000',
        },
        onUpdate,
        onNext: () => undefined,
        availableProjects,
        selectedProjectId: 7n,
        onSelectProject,
      }),
    )

    const contractSelect = screen.getAllByRole('combobox').at(1) as HTMLButtonElement

    expect(contractSelect).toHaveTextContent('0x7777777777777777777777777777777777777777')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(screen.queryByText('Contract ABI (JSON)')).not.toBeInTheDocument()
    expect(screen.queryByText('Chain')).not.toBeInTheDocument()
  })

  it('highlights explorer project selector when retry context requests refocus', () => {
    const availableProjects = [
      createMockProject({
        id: 7n,
        targetContract: '0x7777777777777777777777777777777777777777',
        forkBlock: 22000000n,
      }),
    ]

    render(
      React.createElement(TargetStep, {
        config: {
          targetContract: '0x7777777777777777777777777777777777777777',
          chain: 'Sepolia',
          forkBlock: '',
        },
        onUpdate: vi.fn(),
        availableProjects,
        selectedProjectId: 7n,
        projectSelectionOnly: true,
        projectContextHighlightNonce: 1,
      }),
    )

    const trigger = screen.getByTestId('target-project-select-trigger')
    expect(trigger).toHaveAttribute('data-highlighted', 'true')
  })

  it('defers retry-context highlight until target step becomes active', () => {
    const availableProjects = [
      createMockProject({
        id: 7n,
        targetContract: '0x7777777777777777777777777777777777777777',
        forkBlock: 22000000n,
      }),
    ]

    const { rerender } = render(
      React.createElement(TargetStep, {
        config: {
          targetContract: '0x7777777777777777777777777777777777777777',
          chain: 'Sepolia',
          forkBlock: '',
        },
        onUpdate: vi.fn(),
        availableProjects,
        selectedProjectId: 7n,
        projectSelectionOnly: true,
        projectContextHighlightNonce: 1,
        isActive: false,
      }),
    )

    const triggerBefore = screen.getByTestId('target-project-select-trigger')
    expect(triggerBefore).toHaveAttribute('data-highlighted', 'false')

    rerender(
      React.createElement(TargetStep, {
        config: {
          targetContract: '0x7777777777777777777777777777777777777777',
          chain: 'Sepolia',
          forkBlock: '',
        },
        onUpdate: vi.fn(),
        availableProjects,
        selectedProjectId: 7n,
        projectSelectionOnly: true,
        projectContextHighlightNonce: 1,
        isActive: true,
      }),
    )

    const triggerAfter = screen.getByTestId('target-project-select-trigger')
    expect(triggerAfter).toHaveAttribute('data-highlighted', 'true')
  })

  it('keeps conditions, transactions, and impact edits deterministic under burst input', () => {
    vi.useFakeTimers()

    const onConditionUpdate = vi.fn()
    const onTransactionUpdate = vi.fn()
    const onImpactUpdate = vi.fn()

    const { container: conditionsContainer } = render(
      React.createElement(ConditionsStep, {
        conditions: [{ id: 'cond-1', type: 'setBalance', value: '', target: '', slot: '' }],
        onAdd: () => undefined,
        onRemove: () => undefined,
        onUpdate: onConditionUpdate,
        onNext: () => undefined,
        onBack: () => undefined
      })
    )

    const conditionValueInput = conditionsContainer.querySelector('input[placeholder="Value (e.g. 1000000000000000000)"]') as HTMLInputElement | null
    expect(conditionValueInput).not.toBeNull()
    if (!conditionValueInput) {
      vi.useRealTimers()
      return
    }

    act(() => {
      fireEvent.change(conditionValueInput, { target: { value: '1' } })
      fireEvent.change(conditionValueInput, { target: { value: '12' } })
      fireEvent.change(conditionValueInput, { target: { value: '123' } })
      fireEvent.change(conditionValueInput, { target: { value: '1234' } })
    })

    expect(onConditionUpdate.mock.calls.length).toBeLessThanOrEqual(2)

    const manyTransactions = Array.from({ length: 80 }, (_, index) => ({
      id: `tx-${index}`,
      to: '',
      value: '0',
      data: '0x'
    }))

    const { container: transactionsContainer } = render(
      React.createElement(TransactionsStep, {
        transactions: manyTransactions,
        onAdd: () => undefined,
        onRemove: () => undefined,
        onUpdate: onTransactionUpdate,
        onNext: () => undefined,
        onBack: () => undefined
      })
    )

    const firstTransactionHeader = Array.from(
      transactionsContainer.querySelectorAll<HTMLElement>('.cursor-pointer')
    ).find((element) => element.textContent?.includes('TX_01')) ?? null
    expect(firstTransactionHeader).not.toBeNull()
    if (!firstTransactionHeader) {
      vi.useRealTimers()
      return
    }

    act(() => {
      fireEvent.click(firstTransactionHeader)
    })

    const toAddressInput = transactionsContainer.querySelector('input[placeholder="0x..."]') as HTMLInputElement | null
    expect(toAddressInput).not.toBeNull()
    if (!toAddressInput) {
      vi.useRealTimers()
      return
    }

    act(() => {
      fireEvent.change(toAddressInput, { target: { value: '0xabc' } })
      fireEvent.change(toAddressInput, { target: { value: '0xabcd' } })
      fireEvent.change(toAddressInput, { target: { value: '0xabcde' } })
      fireEvent.change(toAddressInput, { target: { value: '0xabcdef' } })
    })

    expect(onTransactionUpdate.mock.calls.length).toBeLessThanOrEqual(2)

    const { container: impactContainer } = render(
      React.createElement(ImpactStep, {
        config: {
          type: 'fundsDrained',
          estimatedLoss: '',
          description: ''
        },
        onUpdate: onImpactUpdate,
        onNext: () => undefined,
        onBack: () => undefined
      })
    )

    expect(screen.getByText('Impact Description (optional)')).toBeInTheDocument()
    expect(screen.queryByText('Direct theft of protocol funds')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Estimated Loss (ETH in wei)')).not.toBeInTheDocument()

    const impactDescription = impactContainer.querySelector('textarea#impact-description') as HTMLTextAreaElement | null
    expect(impactDescription).not.toBeNull()
    if (!impactDescription) {
      vi.useRealTimers()
      return
    }

    act(() => {
      fireEvent.change(impactDescription, { target: { value: 'a' } })
      fireEvent.change(impactDescription, { target: { value: 'ab' } })
      fireEvent.change(impactDescription, { target: { value: 'abc' } })
      fireEvent.change(impactDescription, { target: { value: 'abcd' } })
    })

    expect(onImpactUpdate.mock.calls.length).toBeLessThanOrEqual(2)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onConditionUpdate).toHaveBeenLastCalledWith('cond-1', 'value', '1234')
    expect(onTransactionUpdate).toHaveBeenLastCalledWith('tx-0', 'to', '0xabcdef')
    expect(onImpactUpdate).toHaveBeenLastCalledWith('description', 'abcd')

    vi.useRealTimers()
  })
})

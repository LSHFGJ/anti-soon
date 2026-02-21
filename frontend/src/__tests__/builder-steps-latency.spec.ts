import React from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TargetStep } from '../components/PoCBuilder/Steps/TargetStep'
import { ConditionsStep } from '../components/PoCBuilder/Steps/ConditionsStep'
import { TransactionsStep } from '../components/PoCBuilder/Steps/TransactionsStep'
import { ImpactStep } from '../components/PoCBuilder/Steps/ImpactStep'

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
  it('coalesces target typing updates while preserving final target address', () => {
    vi.useFakeTimers()

    const onUpdate = vi.fn()
    const { container } = render(
      React.createElement(TargetStep, {
        config: {
          targetContract: '',
          chain: 'Sepolia',
          forkBlock: '',
          abiJson: '[]'
        },
        onUpdate,
        onNext: () => undefined
      })
    )

    const targetInput = container.querySelector('input[placeholder="0x..."]') as HTMLInputElement | null
    expect(targetInput).not.toBeNull()
    if (!targetInput) {
      vi.useRealTimers()
      return
    }

    const typedValues = [
      '0x1',
      '0x11',
      '0x111',
      '0x1111',
      '0x11111',
      '0x111111',
      '0x1111111',
      '0x11111111'
    ]

    act(() => {
      for (const value of typedValues) {
        fireEvent.change(targetInput, { target: { value } })
      }
    })

    expect(targetInput.value).toBe('0x11111111')
    expect(onUpdate.mock.calls.length).toBeLessThanOrEqual(2)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onUpdate).toHaveBeenCalled()
    expect(onUpdate).toHaveBeenLastCalledWith('targetContract', '0x11111111')

    vi.useRealTimers()
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

    const firstTransactionHeader = transactionsContainer.querySelector('.cursor-pointer') as HTMLElement | null
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

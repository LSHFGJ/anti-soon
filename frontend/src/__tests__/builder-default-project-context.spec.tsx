import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from '../test/utils'

const { mockReadContract, mockReadProjectsByIds } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockReadProjectsByIds: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    readContract: mockReadContract,
  },
}))

vi.mock('../lib/projectReads', () => ({
  readProjectsByIds: mockReadProjectsByIds,
}))

vi.mock('../components/PoCBuilder', () => ({
  PoCBuilder: ({ submissionProjectId }: { submissionProjectId: bigint | null }) => (
    <div data-testid="builder-submission-project">{submissionProjectId === null ? 'none' : submissionProjectId.toString()}</div>
  ),
}))

import { Builder } from '../pages/Builder'

function renderBuilder(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/builder" element={<Builder />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Builder default project context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

	it('uses the first active project with active VNet as default when no explicit project context exists', async () => {
		mockReadContract.mockResolvedValue(3n)
		mockReadProjectsByIds.mockResolvedValue([
			createMockProject({ id: 0n, active: false }),
			createMockProject({ id: 1n, active: true, vnetStatus: 1 }),
			createMockProject({ id: 2n, active: true }),
		])

		renderBuilder('/builder')

		await waitFor(() => {
			expect(screen.getByTestId('builder-project-context')).toHaveTextContent('DEFAULT_PROJECT_ID: #2')
			expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('2')
		})

    expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'nextProjectId' }))
    expect(mockReadProjectsByIds).toHaveBeenCalledWith([0n, 1n, 2n])
  })

  it('skips default loading when explicit context is provided', async () => {
    renderBuilder('/builder?projectId=9')

    await waitFor(() => {
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('CONTEXT_PROJECT_ID: #9')
      expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('9')
    })

    expect(mockReadContract).not.toHaveBeenCalled()
    expect(mockReadProjectsByIds).not.toHaveBeenCalled()
  })
})

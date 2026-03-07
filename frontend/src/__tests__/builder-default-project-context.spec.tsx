import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from '../test/utils'

const { mockReadContract, mockReadProjectsByIds } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockReadProjectsByIds: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  readContractWithRpcFallback: mockReadContract,
}))

vi.mock('../lib/projectReads', () => ({
  readProjectsByIds: mockReadProjectsByIds,
}))

vi.mock('../components/PoCBuilder', () => ({
  PoCBuilder: ({
    submissionProjectId,
    availableProjects,
  }: {
    submissionProjectId: bigint | null
    availableProjects?: Array<{ id: bigint }>
  }) => {
    const selectedProject = submissionProjectId === null
      ? null
      : (availableProjects?.find((project) => project.id === submissionProjectId) ?? null)

    return (
      <>
        {selectedProject ? (
          <div data-testid="builder-project-context">PROJECT: #{selectedProject.id.toString()}</div>
        ) : null}
        <div data-testid="builder-submission-project">{submissionProjectId === null ? 'none' : submissionProjectId.toString()}</div>
        <div data-testid="builder-available-projects">
          {availableProjects && availableProjects.length > 0
            ? availableProjects.map((project) => project.id.toString()).join(',')
            : 'none'}
        </div>
      </>
    )
  },
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
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
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('PROJECT: #2')
      expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('2')
    })

    expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'nextProjectId' }))
    expect(mockReadProjectsByIds).toHaveBeenCalledWith([2n, 1n, 0n])
  })

  it('keeps explicit context even while preloading project options', async () => {
    mockReadContract.mockResolvedValue(1n)
    mockReadProjectsByIds
      .mockResolvedValueOnce([
        createMockProject({ id: 0n, active: true }),
      ])
      .mockResolvedValueOnce([
        createMockProject({ id: 9n, active: true }),
      ])

    renderBuilder('/builder?projectId=9')

    await waitFor(() => {
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('PROJECT: #9')
      expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('9')
    })

    expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'nextProjectId' }))
    expect(mockReadProjectsByIds).toHaveBeenNthCalledWith(1, [9n])
    expect(mockReadProjectsByIds).toHaveBeenNthCalledWith(2, [0n])
  })

  it('falls back to loading explicit project metadata when project index is empty', async () => {
    mockReadContract.mockResolvedValue(0n)
    mockReadProjectsByIds.mockResolvedValue([
      createMockProject({ id: 9n, active: true }),
    ])

    renderBuilder('/builder?projectId=9')

    await waitFor(() => {
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('PROJECT: #9')
      expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('9')
      expect(screen.getByTestId('builder-available-projects')).toHaveTextContent('9')
    })

    expect(mockReadProjectsByIds).toHaveBeenCalledWith([9n])
  })

  it('waits for project context before rendering PoCBuilder content', async () => {
    const projectsDeferred = deferred<ReturnType<typeof createMockProject>[]>()

    mockReadContract.mockResolvedValue(1n)
    mockReadProjectsByIds.mockReturnValue(projectsDeferred.promise)

    renderBuilder('/builder')

    expect(screen.queryByTestId('builder-submission-project')).not.toBeInTheDocument()
    expect(screen.getByText('Loading project context...')).toBeInTheDocument()

    projectsDeferred.resolve([
      createMockProject({ id: 0n, active: true }),
    ])

    await waitFor(() => {
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('PROJECT: #0')
      expect(screen.queryByText('Loading project context...')).not.toBeInTheDocument()
    })
  })

  it('renders explicit project context without waiting for full project index preload', async () => {
    const nextProjectDeferred = deferred<bigint>()

    mockReadContract.mockReturnValue(nextProjectDeferred.promise)
    mockReadProjectsByIds.mockResolvedValue([
      createMockProject({ id: 9n, active: true }),
    ])

    renderBuilder('/builder?projectId=9')

    await waitFor(() => {
      expect(screen.getByTestId('builder-project-context')).toHaveTextContent('PROJECT: #9')
      expect(screen.getByTestId('builder-submission-project')).toHaveTextContent('9')
      expect(screen.queryByText('Loading project context...')).not.toBeInTheDocument()
    })

    expect(mockReadProjectsByIds).toHaveBeenCalledWith([9n])
  })
})

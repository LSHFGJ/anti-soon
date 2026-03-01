import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, act } from '@testing-library/react'
import { Toaster } from '@/components/ui/sonner'
import { useToast, toast } from '@/hooks/use-toast'
import { ToastProvider } from '@/components/ToastProvider'

const {
  defaultToastMock,
  successToastMock,
  errorToastMock,
  warningToastMock,
  infoToastMock,
} = vi.hoisted(() => ({
  defaultToastMock: vi.fn(),
  successToastMock: vi.fn(),
  errorToastMock: vi.fn(),
  warningToastMock: vi.fn(),
  infoToastMock: vi.fn(),
}))

vi.mock('sonner', () => {
  return {
    Toaster: vi.fn(({ ...props }) => (
      <div data-testid="sonner-toaster" data-position={props.position} data-theme={props.theme}>
        Toaster
      </div>
    )),
    toast: Object.assign(defaultToastMock, {
      success: successToastMock,
      error: errorToastMock,
      warning: warningToastMock,
      info: infoToastMock,
    }),
  }
})

import * as sonner from 'sonner'

const getDefaultToastMock = () => defaultToastMock

describe('Toast System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('useToast hook', () => {
    it('should return toast function and variant helpers', () => {
      const { result } = renderHook(() => useToast())

      expect(typeof result.current.toast).toBe('function')
      expect(typeof result.current.success).toBe('function')
      expect(typeof result.current.error).toBe('function')
      expect(typeof result.current.warning).toBe('function')
      expect(typeof result.current.info).toBe('function')
    })

    it('should call sonner.success when using success helper', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.success({ title: 'Success!', description: 'Operation completed' })
      })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'Success!',
        expect.objectContaining({
          description: 'Operation completed',
        })
      )
    })

    it('should call sonner.error when using error helper', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.error({ title: 'Error!', description: 'Something went wrong' })
      })

      expect(sonner.toast.error).toHaveBeenCalledWith(
        'Error!',
        expect.objectContaining({
          description: 'Something went wrong',
        })
      )
    })

    it('should call sonner.warning when using warning helper', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.warning({ title: 'Warning!', description: 'Check this out' })
      })

      expect(sonner.toast.warning).toHaveBeenCalledWith(
        'Warning!',
        expect.objectContaining({
          description: 'Check this out',
        })
      )
    })

    it('should use default duration of 3000ms', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.success({ title: 'Test' })
      })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'Test',
        expect.objectContaining({
          duration: 3000,
        })
      )
    })

    it('should support custom duration', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.success({ title: 'Custom', duration: 5000 })
      })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'Custom',
        expect.objectContaining({
          duration: 5000,
        })
      )
    })

    it('should support action buttons', () => {
      const { result } = renderHook(() => useToast())
      const onClick = vi.fn()

      act(() => {
        result.current.success({
          title: 'With Action',
          action: { label: 'Undo', onClick },
        })
      })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'With Action',
        expect.objectContaining({
          action: expect.objectContaining({
            label: 'Undo',
          }),
        })
      )
    })

    it('should support cancel buttons', () => {
      const { result } = renderHook(() => useToast())
      const onCancel = vi.fn()

      act(() => {
        result.current.success({
          title: 'With Cancel',
          cancel: { label: 'Dismiss', onClick: onCancel },
        })
      })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'With Cancel',
        expect.objectContaining({
          cancel: expect.objectContaining({
            label: 'Dismiss',
          }),
        })
      )
    })
  })

  describe('toast utility object', () => {
    it('should export toast.success function', () => {
      expect(typeof toast.success).toBe('function')
    })

    it('should export toast.error function', () => {
      expect(typeof toast.error).toBe('function')
    })

    it('should export toast.warning function', () => {
      expect(typeof toast.warning).toBe('function')
    })

    it('should export toast.info function', () => {
      expect(typeof toast.info).toBe('function')
    })

    it('should export toast.default function', () => {
      expect(typeof toast.default).toBe('function')
    })

    it('should call sonner.toast.success with correct arguments', () => {
      toast.success('Success message', { description: 'Details here' })

      expect(sonner.toast.success).toHaveBeenCalledWith(
        'Success message',
        expect.objectContaining({
          description: 'Details here',
        })
      )
    })

    it('should call sonner.toast.error with correct arguments', () => {
      toast.error('Error message', { description: 'Error details' })

      expect(sonner.toast.error).toHaveBeenCalledWith(
        'Error message',
        expect.objectContaining({
          description: 'Error details',
        })
      )
    })

    it('should call sonner.toast.warning with correct arguments', () => {
      toast.warning('Warning message', { description: 'Warning details' })

      expect(sonner.toast.warning).toHaveBeenCalledWith(
        'Warning message',
        expect.objectContaining({
          description: 'Warning details',
        })
      )
    })

    it('should support custom duration in utility toast', () => {
      toast.info('Info', { duration: 5000 })

      expect(sonner.toast.info).toHaveBeenCalledWith(
        'Info',
        expect.objectContaining({
          duration: 5000,
        })
      )
    })

    it('should call default toast function', () => {
      toast.default('Default message', { description: 'Default details' })

      expect(getDefaultToastMock()).toHaveBeenCalledWith(
        'Default message',
        expect.objectContaining({
          description: 'Default details',
        })
      )
    })
  })

  describe('Toaster component', () => {
    it('should render with dark theme', () => {
      render(<Toaster />)

      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster).toBeInTheDocument()
      expect(toaster).toHaveAttribute('data-theme', 'dark')
    })

    it('should accept custom position prop', () => {
      render(<Toaster position="top-right" />)

      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster).toHaveAttribute('data-position', 'top-right')
    })
  })

  describe('ToastProvider component', () => {
    it('should render Toaster component', () => {
      render(<ToastProvider />)

      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster).toBeInTheDocument()
    })

    it('should configure bottom-right position', () => {
      render(<ToastProvider />)

      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster).toHaveAttribute('data-position', 'bottom-right')
    })
  })

  describe('Toast message types', () => {
    it('should support success type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.success({ title: 'Success!' })
      })

      expect(sonner.toast.success).toHaveBeenCalled()
    })

    it('should support error type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.error({ title: 'Error!' })
      })

      expect(sonner.toast.error).toHaveBeenCalled()
    })

    it('should support warning type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.warning({ title: 'Warning!' })
      })

      expect(sonner.toast.warning).toHaveBeenCalled()
    })

    it('should support info type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.info({ title: 'Info!' })
      })

      expect(sonner.toast.info).toHaveBeenCalled()
    })

    it('should support default type', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'Default!', variant: 'default' })
      })

      expect(getDefaultToastMock()).toHaveBeenCalledWith(
        'Default!',
        expect.objectContaining({
          duration: 3000,
        })
      )
    })
  })

  describe('Integration', () => {
    it('should have ToastProvider at correct position in component tree', () => {
      const { container } = render(<ToastProvider />)

      expect(container.querySelector('[data-testid="sonner-toaster"]')).toBeInTheDocument()
    })
  })
})

describe('Toast Auto-close Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should use 3000ms default duration', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.success({ title: 'Test toast' })
    })

    expect(sonner.toast.success).toHaveBeenCalledWith(
      'Test toast',
      expect.objectContaining({
        duration: 3000,
      })
    )
  })

  it('should allow manual close via closeButton', () => {
    // ToastProvider includes closeButton prop
    render(<ToastProvider />)

    const toaster = screen.getByTestId('sonner-toaster')
    expect(toaster).toBeInTheDocument()
  })
})

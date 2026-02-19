import * as React from "react"
import { toast as sonnerToast, type ExternalToast } from "sonner"

type ToastVariant = "default" | "success" | "error" | "warning" | "info"

interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  action?: {
    label: string
    onClick: () => void
  }
  cancel?: {
    label: string
    onClick?: () => void
  }
  duration?: number
}

const variantToToastFunction = {
  default: sonnerToast,
  success: sonnerToast.success,
  error: sonnerToast.error,
  warning: sonnerToast.warning,
  info: sonnerToast.info,
}

export function useToast() {
  const toast = React.useCallback((options: ToastOptions) => {
    const {
      title,
      description,
      variant = "default",
      action,
      cancel,
      duration = 3000,
    } = options

    const toastFn = variantToToastFunction[variant]
    const externalOptions: ExternalToast = {
      description,
      duration,
      action: action
        ? {
            label: action.label,
            onClick: () => action.onClick(),
          }
        : undefined,
      cancel: cancel
        ? {
            label: cancel.label,
            onClick: () => cancel.onClick?.(),
          }
        : undefined,
    }

    if (title) {
      toastFn(title, externalOptions)
    } else if (description) {
      sonnerToast(description, externalOptions)
    }
  }, [])

  return {
    toast,
    success: (options: Omit<ToastOptions, "variant">) =>
      toast({ ...options, variant: "success" }),
    error: (options: Omit<ToastOptions, "variant">) =>
      toast({ ...options, variant: "error" }),
    warning: (options: Omit<ToastOptions, "variant">) =>
      toast({ ...options, variant: "warning" }),
    info: (options: Omit<ToastOptions, "variant">) =>
      toast({ ...options, variant: "info" }),
  }
}

export const toast = {
  success: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => {
    sonnerToast.success(title, { description: options?.description, duration: options?.duration })
  },
  error: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => {
    sonnerToast.error(title, { description: options?.description, duration: options?.duration })
  },
  warning: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => {
    sonnerToast.warning(title, { description: options?.description, duration: options?.duration })
  },
  info: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => {
    sonnerToast.info(title, { description: options?.description, duration: options?.duration })
  },
  default: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => {
    sonnerToast(title, { description: options?.description, duration: options?.duration })
  },
}

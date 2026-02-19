import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--color-bg)] group-[.toaster]:text-[var(--color-text)] group-[.toaster]:border-[var(--color-primary)] group-[.toaster]:shadow-[0_0_20px_var(--color-primary-dim)] group-[.toaster]:font-mono",
          description: "group-[.toast]:text-[var(--color-text-dim)]",
          actionButton:
            "group-[.toast]:bg-[var(--color-primary)] group-[.toast]:text-[var(--color-bg)] group-[.toast]:hover:shadow-[0_0_15px_var(--color-primary)]",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:border-[var(--color-error)] group-[.toast]:text-[var(--color-error)]",
          success:
            "group-[.toast]:border-[var(--color-primary)] group-[.toast]:text-[var(--color-primary)]",
          error:
            "group-[.toast]:border-[var(--color-error)] group-[.toast]:text-[var(--color-error)]",
          warning:
            "group-[.toast]:border-[var(--color-warning)] group-[.toast]:text-[var(--color-warning)]",
          info: "group-[.toast]:border-[var(--color-secondary)] group-[.toast]:text-[var(--color-secondary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }

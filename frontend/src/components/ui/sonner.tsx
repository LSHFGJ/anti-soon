import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-[min(92vw,560px)] !max-w-[560px] !items-start !gap-3 bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-primary)] shadow-[0_0_20px_var(--color-primary-dim)] font-mono",
          title:
            "whitespace-normal break-words leading-snug",
          description:
            "text-[var(--color-text-dim)] whitespace-normal break-words leading-relaxed",
          content:
            "flex-1 min-w-0",
          actionButton:
            "h-auto max-w-[9rem] shrink whitespace-normal break-words px-2 py-1.5 text-[11px] leading-tight bg-[var(--color-primary)] text-[var(--color-bg)] hover:shadow-[0_0_15px_var(--color-primary)]",
          cancelButton:
            "h-auto max-w-[9rem] shrink whitespace-normal break-words px-2 py-1.5 text-[11px] leading-tight bg-transparent border-[var(--color-error)] text-[var(--color-error)]",
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

export { Toaster }

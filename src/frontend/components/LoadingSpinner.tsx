interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function LoadingSpinner({ size = "md", text }: LoadingSpinnerProps) {
  const sizeClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-8 w-8";

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div
          className={`mx-auto mb-4 animate-spin rounded-full border-2 border-primary border-t-transparent ${sizeClass}`}
        />
        {text && <p className="text-muted-foreground">{text}</p>}
      </div>
    </div>
  );
}

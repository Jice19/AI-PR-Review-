interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export function LoadingSpinner({ size = "md", text }: LoadingSpinnerProps) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : size === "lg" ? "h-3 w-3" : "h-2 w-2";
  const gap = size === "sm" ? "gap-1" : size === "lg" ? "gap-2" : "gap-1.5";

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className={`mx-auto mb-4 flex items-center justify-center ${gap}`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`${dotSize} rounded-full bg-primary`}
              style={{
                animation: `pulse-dot 1.2s ease-in-out ${i * 0.15}s infinite both`,
              }}
            />
          ))}
        </div>
        {text && <p className="text-sm text-muted-foreground animate-pulse">{text}</p>}
        <style>{`
          @keyframes pulse-dot {
            0%, 100% { transform: scale(0.8); opacity: 0.4; }
            50% { transform: scale(1.2); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

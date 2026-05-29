import { PRUrlForm, FeatureCards } from "@/frontend/components";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        {/* Hero */}
        <div className="animate-fade-in-down">
          <h1 className="mb-3 text-5xl font-bold tracking-tight">
            <span className="animate-gradient bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              AI PR Review
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            智能代码评审助手，提升 Pull Request Review 效率与质量
          </p>
        </div>

        {/* Form */}
        <div className="mt-10 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          <PRUrlForm />
        </div>

        {/* Features */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <FeatureCards />
        </div>
      </div>
    </div>
  );
}

import { PRUrlForm, FeatureCards } from "@/frontend/components";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">AI PR Review</h1>
        <p className="mb-8 text-lg text-muted-foreground">
          智能代码评审助手，提升 Pull Request Review 效率与质量
        </p>
        <PRUrlForm />
        <FeatureCards />
      </div>
    </div>
  );
}

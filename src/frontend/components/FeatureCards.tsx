const features = [
  { title: "变更总结", desc: "自动生成 PR 变更摘要和影响范围分析" },
  { title: "风险识别", desc: "覆盖前后端和数据库的全面安全检查" },
  { title: "修复建议", desc: "高危问题附带可执行的代码修复方案" },
];

export function FeatureCards() {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-3">
      {features.map((f) => (
        <div key={f.title} className="rounded-lg border bg-card p-4 text-left">
          <h3 className="font-semibold">{f.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

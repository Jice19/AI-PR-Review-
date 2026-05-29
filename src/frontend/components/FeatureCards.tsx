const features = [
  { title: "变更总结", desc: "自动生成 PR 变更摘要和影响范围分析", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  { title: "风险识别", desc: "覆盖前后端和数据库的全面安全检查", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
  { title: "修复建议", desc: "高危问题附带可执行的代码修复方案", icon: "M11.42 15.17l7.5-7.5m-5.585 1.665l.97.97-3.535 3.536-.97-.97 3.535-3.536zm-3.535 5.657h4.95M16.5 21h-9a2.25 2.25 0 01-2.25-2.25V5.25A2.25 2.25 0 017.5 3h9a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21z" },
];

const colors = [
  "from-indigo-500/10 to-violet-500/10 text-indigo-400",
  "from-emerald-500/10 to-teal-500/10 text-emerald-400",
  "from-amber-500/10 to-orange-500/10 text-amber-400",
];

export function FeatureCards() {
  return (
    <div className="mt-14 grid gap-4 sm:grid-cols-3 stagger">
      {features.map((f, i) => (
        <div
          key={f.title}
          className={`group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br ${colors[i]} p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:border-border hover:shadow-lg`}
        >
          <div className={`mb-3 inline-flex rounded-lg bg-background/80 p-2`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
            </svg>
          </div>
          <h3 className="font-semibold text-foreground">{f.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

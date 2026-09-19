export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#0A0A0A] text-[#EAEAEA]">
      <div className="border border-[#262626] p-8 max-w-xl w-full bg-[#121212]">
        <div className="flex items-center justify-between border-b border-[#262626] pb-4 mb-4">
          <span className="text-xs uppercase tracking-widest text-[#FF2A2A] font-mono font-bold">
            [ SKYLARK DRONES TELEMETRY ]
          </span>
          <span className="text-xs font-mono text-[#888888]">REV 1.0.0</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-mono mb-2">MONDAY.COM BI AGENT</h1>
        <p className="text-sm text-[#888888] font-mono leading-relaxed">
          Autonomous multi-agent intelligence system initialized. Reading live monday.com boards
          with deterministic metric math and data resilience.
        </p>
      </div>
    </main>
  );
}

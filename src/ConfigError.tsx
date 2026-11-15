export default function ConfigError({ missing, error }: { missing?: string[]; error?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-[#ededed]">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="mb-1 text-lg font-semibold tracking-tight">Airtrohp</div>
        <h1 className="mb-3 text-sm text-white/60">
          {missing?.length ? 'The app is not configured yet.' : 'The app failed to start.'}
        </h1>
        {missing?.length ? (
          <>
            <p className="mb-3 text-sm text-white/70">
              These build-time environment variables are empty. Add them in Vercel under Settings, Environment Variables,
              then redeploy (they are baked in at build time):
            </p>
            <ul className="mb-4 space-y-1 font-mono text-xs text-white/80">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : (
          <pre className="mb-4 whitespace-pre-wrap break-words font-mono text-xs text-white/70">{error}</pre>
        )}
        <p className="text-xs text-white/40">See .env.example and the README for the full list.</p>
      </div>
    </div>
  );
}

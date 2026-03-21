import { LivePrice } from '../components/trading';

export default function DashboardPage() {
  return (
    <div className="h-full overflow-auto bg-[#0B0F19] p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">Command Center</h1>
              <p className="text-sm text-white/60">
                Desktop ligero para terminales, workspaces y lanzamiento de servicios locales.
              </p>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Desktop-first
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Primary Use</div>
              <div className="mt-2 text-lg font-semibold text-white">Terminales y workspaces</div>
              <p className="mt-2 text-sm text-white/65">
                Usa la barra lateral para abrir shells en carpetas de trabajo y disparar comandos locales.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Heavy Modules</div>
              <div className="mt-2 text-lg font-semibold text-white">Carga bajo demanda</div>
              <p className="mt-2 text-sm text-white/65">
                Portfolio, liquidations, polymarket y calendar se cargan solo cuando entras.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Streams</div>
              <div className="mt-2 text-lg font-semibold text-white">Abrir fuera del shell</div>
              <p className="mt-2 text-sm text-white/65">
                Los videos y dashboards externos conviene verlos en navegador, no embebidos en Electron.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 shadow-xl">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Live Price
          </div>
          <LivePrice />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <a
            href="https://www.youtube.com/watch?v=LgUYk36ll1c"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-red-950/60 to-black p-5 shadow-xl transition hover:border-red-400/40 hover:bg-red-950/40"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-red-300/70">External Stream</div>
            <div className="mt-2 text-lg font-semibold text-white">Crypto Trading Live</div>
            <p className="mt-2 text-sm text-white/65">
              Abrir en navegador para no meter iframes de video dentro del renderer principal.
            </p>
          </a>

          <a
            href="https://www.youtube.com/watch?v=69jd1dOq4C8"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-orange-950/50 to-black p-5 shadow-xl transition hover:border-orange-400/40 hover:bg-orange-950/30"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-orange-300/70">External Stream</div>
            <div className="mt-2 text-lg font-semibold text-white">Bitcoin Analysis Live</div>
            <p className="mt-2 text-sm text-white/65">
              Usalo fuera de la app cuando quieras monitoreo visual continuo.
            </p>
          </a>

          <a
            href="https://www.youtube.com/watch?v=JUerQ34pC5c"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-5 shadow-xl transition hover:border-white/20 hover:bg-zinc-900/80"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Members Stream</div>
            <div className="mt-2 text-lg font-semibold text-white">Bitcoin Members Live</div>
            <p className="mt-2 text-sm text-white/65">
              Enlace directo para abrirlo con tu sesion de YouTube en el navegador.
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}

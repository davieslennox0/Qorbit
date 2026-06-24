import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/send', label: 'Send' },
  { to: '/receive', label: 'Receive' },
  { to: '/router', label: 'Router' },
  { to: '/fraud', label: 'Fraud' },
];

function Layout() {
  return (
    <div className="min-h-screen flex bg-bg text-slate-100">
      <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-6">
          <div className="text-xl font-semibold tracking-tight">
            Quatripe<span className="text-cyan">.</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Arc testnet</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-2 text-gold border border-border'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-surface-2'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-slate-600 font-mono">chainId 5042002</div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;

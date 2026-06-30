import { Link, NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard' },
  { to: '/app/send', label: 'Send' },
  { to: '/app/receive', label: 'Receive' },
  { to: '/app/router', label: 'Router' },
  { to: '/app/fraud', label: 'Fraud' },
  { to: '/app/agent', label: 'My Agent' },
];

function Layout() {
  return (
    <div className="min-h-screen flex bg-bg text-ink">
      <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-5 py-6">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight hover:opacity-70 transition-opacity">
            Qorbitpay
          </Link>
          <div className="text-xs text-neutral-500 mt-1">Arc testnet</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-ink text-white'
                    : 'text-neutral-600 hover:text-ink hover:bg-surface-2'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-neutral-400 font-mono">chainId 5042002</div>
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

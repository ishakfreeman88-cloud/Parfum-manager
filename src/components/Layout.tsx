import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const tabs = [
  { to: "/", label: "Accueil", icon: "◈" },
  { to: "/stock", label: "Stock", icon: "▤" },
  { to: "/fabrication", label: "Fabrication", icon: "⚗" },
  { to: "/ventes", label: "Ventes", icon: "✦" },
  { to: "/finances", label: "Finances", icon: "◎" },
  { to: "/plus", label: "Plus", icon: "⋯" },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Parfum Manager</span>
        <span className="topbar-right">
          <span className="user-email">{user?.email}</span>
          <button type="button" className="logout" onClick={signOut}>
            Déconnexion
          </button>
        </span>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Navigation principale">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) => "tab" + (isActive ? " active" : "")}
          >
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

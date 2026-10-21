import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { CompanyProvider } from "./company/CompanyContext";
import RequireAuth from "./components/RequireAuth";
import RequireCompany from "./components/RequireCompany";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/Placeholder";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import CreateCompany from "./pages/CreateCompany";

export default function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route element={<RequireAuth />}>
              <Route path="/company/new" element={<CreateCompany />} />
              <Route element={<RequireCompany />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/stock" element={<Placeholder title="Stock" phase="Phases 6 à 9" />} />
                  <Route path="/fabrication" element={<Placeholder title="Fabrication" phase="Phases 10 à 14" />} />
                  <Route path="/ventes" element={<Placeholder title="Ventes" phase="Phases 15 à 18" />} />
                  <Route path="/finances" element={<Placeholder title="Finances" phase="Phases 19 à 22" />} />
                  <Route path="/plus" element={<Placeholder title="Plus" phase="Rapports, rappels, équipe, paramètres" />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </HashRouter>
      </CompanyProvider>
    </AuthProvider>
  );
}

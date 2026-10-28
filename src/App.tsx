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
import More from "./pages/More";
import Team from "./pages/Team";
import Stock from "./pages/Stock";
import Suppliers from "./pages/Suppliers";
import Materials from "./pages/Materials";
import Movements from "./pages/Movements";
import NewMovement from "./pages/NewMovement";
import Backup from "./pages/Backup";
import Purchases from "./pages/Purchases";
import NewPurchase from "./pages/NewPurchase";
import PurchaseDetail from "./pages/PurchaseDetail";
import Fabrication from "./pages/Fabrication";
import Perfumes from "./pages/Perfumes";
import Formats from "./pages/Formats";
import Recipes from "./pages/Recipes";
import RecipeForm from "./pages/RecipeForm";

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
                  <Route path="/stock" element={<Stock />} />
                  <Route path="/stock/matieres" element={<Materials />} />
                  <Route path="/stock/fournisseurs" element={<Suppliers />} />
                  <Route path="/stock/mouvements" element={<Movements />} />
                  <Route path="/stock/mouvements/nouveau" element={<NewMovement />} />
                  <Route path="/stock/achats" element={<Purchases />} />
                  <Route path="/stock/achats/nouveau" element={<NewPurchase />} />
                  <Route path="/stock/achats/:id" element={<PurchaseDetail />} />
                  <Route path="/fabrication" element={<Fabrication />} />
                  <Route path="/fabrication/parfums" element={<Perfumes />} />
                  <Route path="/fabrication/formats" element={<Formats />} />
                  <Route path="/fabrication/recettes" element={<Recipes />} />
                  <Route path="/fabrication/recettes/nouveau" element={<RecipeForm />} />
                  <Route path="/fabrication/recettes/:id/version" element={<RecipeForm />} />
                  <Route path="/ventes" element={<Placeholder title="Ventes" phase="Phases 15 à 18" />} />
                  <Route path="/finances" element={<Placeholder title="Finances" phase="Phases 19 à 22" />} />
                  <Route path="/plus" element={<More />} />
                  <Route path="/plus/sauvegarde" element={<Backup />} />
                  <Route path="/equipe" element={<Team />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </HashRouter>
      </CompanyProvider>
    </AuthProvider>
  );
}

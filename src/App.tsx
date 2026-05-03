import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AppProvider } from "@/context/AppContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Vehiculos from "./pages/Vehiculos";
import Consignatarios from "./pages/Consignatarios";
import Creditos from "./pages/Creditos";
import Ventas from "./pages/Ventas";
import Administracion from "./pages/Administracion";
import Gerencia from "./pages/Gerencia";
import Conversaciones from "./pages/Conversaciones";
import Configuracion from "./pages/Configuracion";
import CrmMovil from "./pages/CrmMovil";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <Toaster />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/clientes" element={<Layout><Clientes /></Layout>} />
          <Route path="/vehiculos" element={<Layout><Vehiculos /></Layout>} />
          <Route path="/consignatarios" element={<Layout><Consignatarios /></Layout>} />
          <Route path="/creditos" element={<Layout><Creditos /></Layout>} />
          <Route path="/ventas" element={<Layout><Ventas /></Layout>} />
          <Route path="/administracion" element={<Layout><Administracion /></Layout>} />
          <Route path="/gerencia" element={<Layout><Gerencia /></Layout>} />
          <Route path="/conversaciones" element={<Layout><Conversaciones /></Layout>} />
          <Route path="/configuracion" element={<Layout><Configuracion /></Layout>} />
          <Route path="/crm-movil" element={<CrmMovil />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  </QueryClientProvider>
);

export default App;

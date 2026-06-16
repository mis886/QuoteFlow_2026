import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Enquiries } from './pages/Enquiries';
import { NewEnquiry } from './pages/NewEnquiry';
import { Quotes } from './pages/Quotes';
import { NewQuote } from './pages/NewQuote';
import { Orders } from './pages/Orders';
import { NewOrder } from './pages/NewOrder';
import { Customers } from './pages/Customers';
import { NewCustomer } from './pages/NewCustomer';
import { Analytics } from './pages/Analytics';
import { Blueprint } from './pages/Blueprint';
import { Settings } from './pages/Settings';
import FollowUps from './pages/FollowUps';
import { Login } from './pages/Login';
import { SubmitPO } from './pages/SubmitPO';
import { IntelligenceBoard } from './pages/IntelligenceBoard';
import { DoerKPI } from './pages/DoerKPI';
import { DoerDetail } from './pages/DoerDetail';
import { useAppStore } from './store';
import { Loader2 } from 'lucide-react';
import { ProductionLayout } from './production/components/ProductionLayout';
import { ProductionDashboard } from './production/pages/ProductionDashboard';
import { NewProductionJob } from './production/pages/NewProductionJob';
import { Sequencer } from './production/pages/Sequencer';
import { JobsList } from './production/pages/JobsList';
import { ProductionOrders } from './production/pages/ProductionOrders';
import { JobDetail } from './production/pages/JobDetail';
import { NCRLog } from './production/pages/NCRLog';
import { ShopFloorSettingsPage } from './production/pages/ShopFloorSettings';
import { PressBoardPage } from './production/pages/PressBoardPage';
import { ProductsList } from './production/pages/ProductsList';
import { ProductDetail } from './production/pages/ProductDetail';
import { NewProduct } from './production/pages/NewProduct';
import { CompoundsList } from './production/pages/CompoundsList';
import { JobCardBoard } from './production/pages/JobCardBoard';
import { LogMolding } from './production/pages/LogMolding';
import { LogFinishing } from './production/pages/LogFinishing';
import { LogInspection } from './production/pages/LogInspection';
import { LogPDI } from './production/pages/LogPDI';
import { DispatchBoard } from './production/pages/DispatchBoard';
import { CreateDispatch } from './production/pages/CreateDispatch';
import { DocsGallery } from './production/pages/DocsGallery';

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAppStore();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-blk opacity-20 animate-spin" />
          <div className="font-mono text-[10px] font-bold tracking-[4px] uppercase text-blk opacity-50">Authorized Access Only</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route — no auth required */}
          <Route path="/submit-po/:quoteId" element={<SubmitPO />} />

          {/* All other routes require auth */}
          <Route path="/*" element={
            <AuthWrapper>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="enquiries" element={<Enquiries />} />
                  <Route path="enquiries/new" element={<NewEnquiry />} />
                  <Route path="quotes" element={<Quotes />} />
                  <Route path="quotes/new" element={<NewQuote />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/new" element={<NewOrder />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/new" element={<NewCustomer />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="doer-kpi" element={<DoerKPI />} />
                  <Route path="doer-kpi/:key" element={<DoerDetail />} />
                  <Route path="blueprint" element={<Blueprint />} />
                  <Route path="followups" element={<FollowUps />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="intelligence" element={<IntelligenceBoard />} />
                  <Route path="*" element={<div className="p-8 text-[13px] font-mono">Module not found...</div>} />
                </Route>
                {/* Production workspace (BETA) — own layout, own sidebar */}
                <Route path="/production" element={<ProductionLayout />}>
                  <Route index element={<ProductionDashboard />} />
                  <Route path="sequencer" element={<Sequencer />} />
                  <Route path="sequencer/:tab" element={<Sequencer />} />
                  <Route path="presses" element={<PressBoardPage />} />
                  <Route path="orders" element={<ProductionOrders />} />
                  <Route path="jobs" element={<JobsList />} />
                  <Route path="jobs/new" element={<NewProductionJob />} />
                  <Route path="jobs/:id" element={<JobDetail />} />
                  <Route path="ncr" element={<NCRLog />} />
                  <Route path="settings" element={<ShopFloorSettingsPage />} />
                  <Route path="products" element={<ProductsList />} />
                  <Route path="products/new" element={<NewProduct />} />
                  <Route path="products/:id" element={<ProductDetail />} />
                  <Route path="products/:id/edit" element={<NewProduct />} />
                  <Route path="compounds" element={<CompoundsList />} />
                  {/* Beta modules */}
                  <Route path="board" element={<JobCardBoard />} />
                  <Route path="log-molding" element={<LogMolding />} />
                  <Route path="log-finishing" element={<LogFinishing />} />
                  <Route path="log-inspection" element={<LogInspection />} />
                  <Route path="log-pdi" element={<LogPDI />} />
                  <Route path="dispatch" element={<DispatchBoard />} />
                  <Route path="dispatch/new" element={<CreateDispatch />} />
                  <Route path="docs" element={<DocsGallery />} />
                  <Route path="*" element={<div className="p-8 text-[13px] font-mono">Production module not found...</div>} />
                </Route>
              </Routes>
            </AuthWrapper>
          } />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
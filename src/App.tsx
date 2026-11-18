import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Enquiries } from './pages/Enquiries';
import { NewEnquiry } from './pages/NewEnquiry';
import { Quotes } from './pages/Quotes';
import { NewQuote } from './pages/NewQuote';
import { Orders } from './pages/Orders';
import { NewOrder } from './pages/NewOrder';
import { Dispatch } from './pages/Dispatch';
import { NewDispatchEntry } from './pages/NewDispatchEntry';
import { Customers } from './pages/Customers';
import { NewCustomer } from './pages/NewCustomer';
import { CustomerLeads } from './pages/CustomerLeads';
import { Analytics } from './pages/Analytics';
import { Blueprint } from './pages/Blueprint';
import { Settings } from './pages/Settings';
import { HistoryLog } from './pages/HistoryLog';
import FollowUps from './pages/FollowUps';
import { Sampling } from './pages/Sampling';
import { SamplingNew } from './pages/SamplingNew';
import { Login } from './pages/Login';
import { SubmitPO } from './pages/SubmitPO';
import { IntelligenceBoard } from './pages/IntelligenceBoard';
import { DoerKPI } from './pages/DoerKPI';
import { DoerDetail } from './pages/DoerDetail';
import { Tickets } from './pages/Tickets';
import { StockRegister } from './pages/StockRegister';
import { StockMovements } from './pages/StockMovements';
import { NewStockInward } from './pages/NewStockInward';
import { NewStockOutward } from './pages/NewStockOutward';
import { useAppStore } from './store';
import { Loader2 } from 'lucide-react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { NewVersionBar } from './components/NewVersionBar';
// 2026-11-02: the Production workspace (unused, 0 jobs) was replaced by the FMS workspace.
import { FmsLayout } from './fms/components/FmsLayout';
import { DashboardPage as FmsDashboard } from './fms/pages/Dashboard';
import { ScorePage as FmsScore, PersonPage as FmsPerson } from './fms/pages/Score';
import { TaskPage as FmsTask, NewTaskPage as FmsNewTask } from './fms/pages/Task';
import { WorkflowsPage as FmsWorkflows, WorkflowPage as FmsWorkflow, WorkflowFormPage as FmsWorkflowForm } from './fms/pages/Workflows';
import { RunsPage as FmsRuns, RunPage as FmsRun } from './fms/pages/Runs';
import { TeamPage as FmsTeam, RecurringPage as FmsRecurring } from './fms/pages/Team';
import { CoordinatorPage as FmsCoordinator } from './fms/pages/Coordinator';
import { AdminUsersPage as FmsAdminUsers, AdminUserPage as FmsAdminUser, AdminSettingsPage as FmsAdminSettings } from './fms/pages/Admin';

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

  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}

export default function App() {
  return (
    <AppProvider>
      <NewVersionBar />
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
                  {/* 2026-10-06: Stock Register = Stock Summary + Stock Book tabs. Old /stock-summary links still work. */}
                  <Route path="stock-register" element={<StockRegister />} />
                  <Route path="stock-summary" element={<Navigate to="/stock-register" replace />} />
                  <Route path="stock-movements" element={<StockMovements />} />
                  <Route path="stock-movements/new" element={<NewStockInward />} />
                  <Route path="stock-movements/new-outward" element={<NewStockOutward />} />
                  <Route path="dispatch" element={<Dispatch />} />
                  <Route path="dispatch/new" element={<NewDispatchEntry />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/new" element={<NewCustomer />} />
                  <Route path="customers/leads" element={<CustomerLeads />} />
                  <Route path="customers/leads/new" element={<NewCustomer key="lead-form" mode="lead" />} />
                  <Route path="tickets" element={<Tickets />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="doer-kpi" element={<DoerKPI />} />
                  <Route path="doer-kpi/:key" element={<DoerDetail />} />
                  <Route path="blueprint" element={<Blueprint />} />
                  <Route path="followups" element={<FollowUps />} />
                  <Route path="sampling" element={<Sampling />} />
                  <Route path="sampling/new" element={<SamplingNew />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="history" element={<HistoryLog />} />
                  <Route path="intelligence" element={<IntelligenceBoard />} />
                  <Route path="*" element={<div className="p-8 text-[13px] font-mono">Module not found...</div>} />
                </Route>
                {/* FMS workspace — workflows, tasks and weekly MIS (replaced Production, 2026-11-02). Own layout and sidebar. */}
                <Route path="/fms" element={<FmsLayout />}>
                  <Route index element={<FmsDashboard />} />
                  <Route path="dashboard" element={<FmsDashboard />} />
                  <Route path="score" element={<FmsScore />} />
                  <Route path="tasks/new" element={<FmsNewTask />} />
                  <Route path="tasks/:id" element={<FmsTask />} />
                  <Route path="workflows" element={<FmsWorkflows />} />
                  <Route path="workflows/new" element={<FmsWorkflowForm key="new" mode="new" />} />
                  <Route path="workflows/:id" element={<FmsWorkflow />} />
                  <Route path="workflows/:id/edit" element={<FmsWorkflowForm key="edit" mode="edit" />} />
                  <Route path="runs" element={<FmsRuns />} />
                  <Route path="runs/:id" element={<FmsRun />} />
                  <Route path="recurring" element={<FmsRecurring />} />
                  <Route path="team" element={<FmsTeam />} />
                  <Route path="team/:id" element={<FmsPerson />} />
                  <Route path="coordinator" element={<FmsCoordinator />} />
                  <Route path="admin/users" element={<FmsAdminUsers />} />
                  <Route path="admin/users/:id" element={<FmsAdminUser />} />
                  <Route path="admin/settings" element={<FmsAdminSettings />} />
                  <Route path="*" element={<Navigate to="/fms" replace />} />
                </Route>
                {/* Old Production links go to FMS. */}
                <Route path="/production/*" element={<Navigate to="/fms" replace />} />
              </Routes>
            </AuthWrapper>
          } />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
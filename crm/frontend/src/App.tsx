import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import DealPipelinePage from "./pages/DealPipelinePage";
import CompaniesPage from "./pages/CompaniesPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";
import TasksPage from "./pages/TasksPage";
import CsvImportPage from "./pages/CsvImportPage";

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<P><DashboardPage /></P>} />
          <Route path="/contacts" element={<P><ContactsPage /></P>} />
          <Route path="/contacts/:id" element={<P><ContactDetailPage /></P>} />
          <Route path="/companies" element={<P><CompaniesPage /></P>} />
          <Route path="/companies/:id" element={<P><CompanyDetailPage /></P>} />
          <Route path="/deals" element={<P><DealPipelinePage /></P>} />
          <Route path="/pipeline" element={<P><DealPipelinePage /></P>} />
          <Route path="/tasks" element={<P><TasksPage /></P>} />
          <Route path="/import" element={<P><CsvImportPage /></P>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

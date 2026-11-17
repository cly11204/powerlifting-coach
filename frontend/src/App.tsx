import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBanner, Loading } from "./components/ui";
import { AthleteProvider, useAthlete } from "./lib/athlete";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import LogStart from "./pages/LogStart";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import Progress from "./pages/Progress";
import Recovery from "./pages/Recovery";
import SessionDetail from "./pages/SessionDetail";
import SessionLogger from "./pages/SessionLogger";

function Gate() {
  const { athlete, loading, error, refresh } = useAthlete();
  if (loading) return <div className="mx-auto max-w-md p-6"><Loading /></div>;
  if (error && !athlete) return <div className="mx-auto max-w-md p-6"><ErrorBanner message={error} onRetry={() => void refresh()} /></div>;
  if (!athlete) return <Onboarding />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="log" element={<LogStart />} />
        <Route path="log/:sessionId" element={<SessionLogger />} />
        <Route path="history" element={<History />} />
        <Route path="history/:sessionId" element={<SessionDetail />} />
        <Route path="progress" element={<Progress />} />
        <Route path="recovery" element={<Recovery />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AthleteProvider>
        <Gate />
      </AthleteProvider>
    </BrowserRouter>
  );
}

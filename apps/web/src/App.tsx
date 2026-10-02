import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";

const Campaign = lazy(() => import("./pages/Campaign"));
const BattlePage = lazy(() => import("./pages/BattlePage"));
const Vote = lazy(() => import("./pages/Vote"));
const Profile = lazy(() => import("./pages/Profile"));
const Workbench = lazy(() => import("./workbench/Workbench"));

function Loading() {
  return <div className="flex h-64 items-center justify-center text-gray-500">Entering the arena…</div>;
}

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/campaign" element={<Campaign />} />
            <Route path="/battle/:bossId" element={<BattlePage />} />
            <Route path="/daily" element={<BattlePage daily />} />
            <Route path="/vote" element={<Vote />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/workbench" element={<Workbench />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}

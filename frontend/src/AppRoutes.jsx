import React, { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useParams,
} from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import DappLayout from "./layouts/DappLayout.jsx";
import ExplorePage from "./pages/ExplorePage.jsx";
import ChogPicker from "./components/ChogPicker.jsx";
import StudioPage from "./pages/StudioPage.jsx";
import LaunchPage from "./pages/LaunchPage.jsx";
import MarketsPage from "./pages/MarketsPage.jsx";
import PortfolioPage from "./pages/PortfolioPage.jsx";
import NetworkPage from "./pages/NetworkPage.jsx";
import TransactionCenter from "./TransactionCenter.jsx";
function Activity() {
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">YOUR WALLET / ACTIVITY</span>
        <h1>Every step, accounted for.</h1>
        <p>Track the transactions submitted from this browser tab.</p>
      </section>
      <TransactionCenter />
      <p className="note">
        Pending transactions remain in this tab when you change pages. Wallet
        confirmation and canonical finality are checked separately.
      </p>
    </>
  );
}
function StudioRoute() {
  const { id } = useParams();
  return <StudioPage key={id} />;
}
function Missing() {
  return (
    <section className="empty">
      <h1>Page not found.</h1>
      <Link className="primary" to="/app/explore">
        Back to the Foundry ↗
      </Link>
    </section>
  );
}
export default function AppRoutes() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title =
      pathname === "/"
        ? "Chog Foundry — Your next launch."
        : `${pathname.split("/")[2] || "Explore"} · Chog Foundry`;
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<DappLayout />}>
        <Route index element={<Navigate to="explore" replace />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="studios" element={<ChogPicker />} />
        <Route path="studios/:id" element={<StudioRoute />} />
        <Route path="launch" element={<LaunchPage />} />
        <Route path="launch/inspect" element={<LaunchPage inspectionMode />} />
        <Route path="markets" element={<MarketsPage />} />
        <Route path="markets/:address" element={<MarketsPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="activity" element={<Activity />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="*" element={<Missing />} />
      </Route>
      <Route path="*" element={<Missing />} />
    </Routes>
  );
}

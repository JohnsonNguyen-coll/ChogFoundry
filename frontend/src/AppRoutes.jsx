import ClubsPage from "./pages/ClubsPage.jsx";
import AgentPage from "./pages/AgentPage.jsx";
import TreasuryPage from "./pages/TreasuryPage.jsx";
import CampaignsPage from "./pages/CampaignsPage.jsx";
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
import DocsPage from './pages/DocsPage.jsx';
import DappLayout from "./layouts/DappLayout.jsx";
import ExplorePage from "./pages/ExplorePage.jsx";
import ChogPicker from "./components/ChogPicker.jsx";
import StudioPage from "./pages/StudioPage.jsx";
import LaunchPage from "./pages/LaunchPage.jsx";
import MarketsPage from "./pages/MarketsPage.jsx";
import PortfolioPage from "./pages/PortfolioPage.jsx";
import NetworkPage from "./pages/NetworkPage.jsx";
import PageIntro from "./components/PageIntro.jsx";
import ChogArtwork from "./components/ChogArtwork.jsx";
import TransactionCenter from "./TransactionCenter.jsx";
function Activity() {
  return (
    <>
      <PageIntro
        scene="activity"
        eyebrow="YOUR WALLET / ACTIVITY"
        title="Every step, accounted for."
        compact
      >
        <p>Track the transactions submitted from this browser tab.</p>
      </PageIntro>
      <TransactionCenter />
      <p className="note">
        Pending transactions remain in this tab when you change pages. Wallet
        approval and blockchain confirmation are checked separately.
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
    <section className="empty missing-page">
      <div className="missing-illustration">
        <ChogArtwork scene="lost" eager />
      </div>
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
    document.title = 'Chog Foundry';
  }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/docs/:slug" element={<DocsPage />} />
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
        <Route path="clubs" element={<ClubsPage />} />
        <Route path="clubs/:id" element={<ClubsPage />} />
        <Route path="agent" element={<AgentPage />} />
        <Route path="agent/:id" element={<AgentPage />} />
        <Route path="treasury" element={<TreasuryPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/:id" element={<CampaignsPage />} />
        <Route path="*" element={<Missing />} />
      </Route>
      <Route path="*" element={<Missing />} />
    </Routes>
  );
}

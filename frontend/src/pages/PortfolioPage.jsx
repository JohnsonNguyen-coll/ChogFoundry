import React from "react";
import { useNavigate } from "react-router-dom";
import PageIntro from "../components/PageIntro.jsx";
import WalletPortfolio from "../WalletPortfolio.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function PortfolioPage() {
  const { wallet } = useSelectedWallet(),
    navigate = useNavigate();
  return (
    <>
      <PageIntro
        scene="portfolio"
        eyebrow="YOUR WALLET / PORTFOLIO"
        title="A little space for what you hold."
        compact
      >
        <p>Inspect your Foundry token holdings and recorded activity.</p>
      </PageIntro>
      <WalletPortfolio
        wallet={wallet}
        onOpenToken={(address) => navigate(`/app/markets/${address}`)}
      />
    </>
  );
}

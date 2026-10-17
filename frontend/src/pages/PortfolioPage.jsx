import React from "react";
import { useNavigate } from "react-router-dom";
import WalletPortfolio from "../WalletPortfolio.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function PortfolioPage() {
  const { wallet } = useSelectedWallet(),
    navigate = useNavigate();
  return (
    <WalletPortfolio
      wallet={wallet}
      onOpenToken={(address) => navigate(`/app/markets/${address}`)}
    />
  );
}

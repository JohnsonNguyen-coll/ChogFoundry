import React from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Brand from "../components/Brand.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
import { walletConfigurationNote } from "../wallet-config.mjs";
const tabs = [
  ["explore", "Explore"],
  ["studios", "My studios"],
  ["launch", "Launch"],
  ["markets", "Markets"],
  ["portfolio", "Portfolio"],
  ["activity", "Transactions"],
  ["network", "Network"],
];
export default function DappLayout() {
  const { error } = useSelectedWallet();
  return (
    <div className="app-shell">
      <div className="app-workspace">
        <header className="app-header">
          <Brand />
          <nav className="app-nav" aria-label="Dapp navigation">
            {tabs.map(([path, label]) => (
              <NavLink key={path} to={`/app/${path}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="app-wallet">
            <ConnectButton accountStatus="address" chainStatus="name" showBalance={false} />
          </div>
        </header>
        <main className="app-content">
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>Monad Mainnet · Built around a Chog.</span>
          <Link to="/">Home</Link>
          {walletConfigurationNote && (
            <details>
              <summary>Wallet connection setup</summary>
              <p>{walletConfigurationNote}</p>
            </details>
          )}
        </footer>
      </div>
    </div>
  );
}

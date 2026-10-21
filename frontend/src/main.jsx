import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import WalletProvider from "./WalletProvider.jsx";
import AppRoutes from "./AppRoutes.jsx";
import RouteLoading from "./components/Loading.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <WalletProvider>
    <BrowserRouter>
      <RouteLoading />
      <AppRoutes />
    </BrowserRouter>
  </WalletProvider>,
);

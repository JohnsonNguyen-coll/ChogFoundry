import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/chog-foundry-logo.webp";
export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Chog Foundry home">
      <img src={logo} className="brand-symbol" alt="" width="42" height="42" />
      <span>
        CHOG<span className="brand-light">FOUNDRY</span>
      </span>
    </Link>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand.jsx";
import logo from "../../assets/chog-foundry-logo.webp";
export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#the-foundry">The Foundry</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <Link className="primary" to="/app">
          Launch App <span>↗</span>
        </Link>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <i className="live-dot" /> A NEW HOME FOR YOUR NEXT IDEA
            </span>
            <h1>
              Your Chog.
              <br />
              Your studio.
              <br />
              <em>Your next launch.</em>
            </h1>
            <p>
              Turn your Chog into a launch studio.
              <br />
              Bring your ideas, build your community,
              <br className="desktop-break" /> and make something worth
              gathering around.
            </p>
            <div className="hero-actions">
              <Link className="primary" to="/app">
                Launch App <span>↗</span>
              </Link>
              <a className="quiet-link" href="#how-it-works">
                Meet the Foundry <span>↓</span>
              </a>
            </div>
            <div className="hero-chain">
              <span className="monad-mark">◇</span> BUILT ON MONAD{" "}
              <span className="chain-divider" /> POWERED BY $CHOG
            </div>
          </div>
          <div className="hero-art" aria-label="Chog Foundry studio emblem">
            <div className="orbital orbital-one" />
            <div className="orbital orbital-two" />
            <div className="art-grid" />
            <div className="art-caption">
              CHOG FOUNDRY
              <br />
              <span>AN IDEA BECOMES A STUDIO.</span>
            </div>
            <div className="emblem-halo" />
            <img src={logo} alt="Chog Foundry emblem" className="hero-emblem" />
            <span className="orbit-label label-top">
              CREATE SOMETHING NEW ↗
            </span>
            <div className="art-plaque">
              <span className="live-dot" />
              <div>
                One Chog. Endless possibilities.
                <small>A studio with a story of its own.</small>
              </div>
              <span>◇</span>
            </div>
          </div>
        </section>
        <section id="the-foundry" className="landing-manifesto">
          <span className="eyebrow">MORE THAN A PFP.</span>
          <h2>
            A place for your ideas.
            <br />
            <span>A story your community builds.</span>
          </h2>
          <p>
            A studio belongs to the Chog that represents it. Its launches,
            creators and stories stay together, even when the NFT finds a new
            owner.
          </p>
        </section>
        <section id="how-it-works" className="feature-grid">
          {[
            [
              "01",
              "Bring your Chog.",
              "Connect your wallet and choose the Chog that will represent your studio.",
            ],
            [
              "02",
              "Shape your next launch.",
              "Prepare a fixed-supply token with a transparent paid first buy and CHOG trading.",
            ],
            [
              "03",
              "Pass on the studio.",
              "Transfer the Chog to pass studio control and future studio fees. Existing creators and earned credits keep their history.",
            ],
          ].map(([n, title, text]) => (
            <article key={n}>
              <span className="feature-number">{n} /</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="landing-cta">
          <span className="eyebrow">THE NEXT THING IS YOURS TO MAKE.</span>
          <h2>What will your Chog build?</h2>
          <Link className="primary" to="/app">
            Enter the Foundry <span>↗</span>
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Your Chog. Your studio. Your next launch.</span>
        <a href="https://www.chog.xyz/" target="_blank" rel="noreferrer">
          Meet Chog ↗
        </a>
      </footer>
    </div>
  );
}

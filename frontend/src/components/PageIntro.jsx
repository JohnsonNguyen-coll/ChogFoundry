import React from "react";
import ChogArtwork from "./ChogArtwork.jsx";

export default function PageIntro({
  scene,
  eyebrow,
  title,
  children,
  compact = false,
}) {
  return (
    <section
      className={`page-intro illustrated-intro${compact ? " compact-intro" : ""}`}
    >
      <div className="intro-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
      </div>
      <div className={`intro-illustration scene-${scene}`}>
        <ChogArtwork scene={scene} eager />
      </div>
    </section>
  );
}

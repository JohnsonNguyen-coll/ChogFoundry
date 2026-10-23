import React from "react";
import spark from "../../assets/chog/web/1.webp";
import explore from "../../assets/chog/web/2.webp";
import guide from "../../assets/chog/web/13.webp";

import art3 from "../../assets/chog/web/3.webp";
import art4 from "../../assets/chog/web/4.webp";
import art5 from "../../assets/chog/web/5.webp";
import art6 from "../../assets/chog/web/6.webp";
import art7 from "../../assets/chog/web/7.webp";
import art8 from "../../assets/chog/web/8.webp";
import art9 from "../../assets/chog/web/9.webp";
import art10 from "../../assets/chog/web/10.webp";
import art11 from "../../assets/chog/web/11.webp";
import art12 from "../../assets/chog/web/12.webp";
import art14 from "../../assets/chog/14.png";

const artwork = {
  identity: { src: art3, width: 847, height: 858 },
  markets: { src: art4, width: 713, height: 857 },
  handover: { src: art5, width: 900, height: 718 },
  create: { src: art6, width: 900, height: 739 },
  studios: { src: art7, width: 882, height: 852 },
  activity: { src: art8, width: 701, height: 823 },
  portfolio: { src: art9, width: 848, height: 866 },
  community: { src: art10, width: 853, height: 858 },
  lost: { src: art11, width: 862, height: 857 },
  network: { src: art12, width: 851, height: 860 },
  spark: { src: spark, width: 712, height: 865 },
  explore: { src: explore, width: 772, height: 857 },
  guide: { src: guide, width: 812, height: 862 },
  campaigns: { src: art14, width: 856, height: 863 },
};

// Editorial illustrations, never representations of a wallet's actual NFT.
export default function ChogArtwork({ scene, className = "", eager = false }) {
  const art = artwork[scene];
  return (
    <img
      {...art}
      className={`chog-artwork ${className}`}
      alt=""
      aria-hidden="true"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}

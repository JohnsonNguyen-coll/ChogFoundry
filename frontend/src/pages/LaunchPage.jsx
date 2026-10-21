import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ChogPicker from "../components/ChogPicker.jsx";
import LaunchWizard from "../LaunchWizard.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function LaunchPage({ inspectionMode = false }) {
  const { wallet } = useSelectedWallet(),
    [search] = useSearchParams(),
    id = search.get("studio");
  const navigate=useNavigate();
  const openMarket=body=>navigate(`/app/markets/${body.receipt.tokenAddress}`,{replace:true,state:{launched:{name:body.token.name,token:body.receipt.tokenAddress,hash:body.receipt.transactionHash}}});
  return (
    <>
      {inspectionMode ? (
        <>
          <Link to="/app/launch" className="back-link">
            ← Launch with your Chog
          </Link>
          <LaunchWizard wallet={wallet} inspectionMode onLaunchComplete={openMarket}/>
        </>
      ) : id && /^(0|[1-9][0-9]*)$/.test(id) && wallet ? (
        <>
          <Link className="back-link" to="/app/launch">
            ← Choose another studio
          </Link>
          <LaunchWizard key={`${id}:${wallet}`} wallet={wallet} nftId={id} onLaunchComplete={openMarket}/>
        </>
      ) : (
        <ChogPicker launch />
      )}
    </>
  );
}

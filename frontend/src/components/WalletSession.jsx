import React from "react";
export default function WalletSession({ auth }) {
  return (
    <section className="community-session">
      <div>
        <span className="eyebrow">WALLET SIGN-IN</span>
        <p>
          {auth.session
            ? `Signed in as ${auth.session.wallet}. Session expires at ${new Date(auth.session.expiresAt).toLocaleTimeString("en-US")}.`
            : "Connect and sign a wallet message to participate. No token purchase is required."}
        </p>
      </div>
      <div className="profile-actions">
        <button
          className="secondary"
          disabled={!auth.wallet || auth.busy}
          onClick={auth.signIn}
        >
          {auth.busy
            ? "Checking wallet..."
            : auth.matches
              ? "Refresh sign-in"
              : "Sign in with wallet"}
        </button>
        {auth.session && (
          <button onClick={auth.signOut} disabled={auth.busy}>
            Sign out
          </button>
        )}
      </div>
      {auth.error && (
        <p className="message error" role="alert">
          {auth.error}
        </p>
      )}
    </section>
  );
}

export function canManageCampaigns(auth, configuration) {
  const wallet = auth.wallet?.toLowerCase();
  return !!(auth.matches && wallet && configuration?.admin === true &&
    auth.session?.wallet?.toLowerCase() === wallet &&
    configuration.sessionWallet?.toLowerCase() === wallet);
}

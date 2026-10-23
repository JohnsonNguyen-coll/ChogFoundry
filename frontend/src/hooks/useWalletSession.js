import {useContext} from 'react';
import {WalletSessionContext} from '../WalletSessionProvider.jsx';
export default function useWalletSession(){
  const session=useContext(WalletSessionContext);
  if(!session)throw new Error('Wallet session provider is missing.');
  return session;
}

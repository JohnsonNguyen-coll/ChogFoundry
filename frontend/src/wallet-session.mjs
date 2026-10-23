// Shared sign-in controller. It never requests transactions or token approvals.
export function createWalletSession({read,now=Date.now,isActive=()=>true}){
  let current=null,pending=null,rawSession=null,checked=false,tick=0,error='',view={wallet:null,session:null,matches:false,busy:false,checking:false,error:'',tick:0};
  const listeners=new Set(),suppressed=new Set(),retryAfter=new Map();
  const matches=()=>!!current?.wallet&&rawSession?.wallet?.toLowerCase()===current.wallet.toLowerCase()&&Date.parse(rawSession.expiresAt)>now();
  const publish=()=>{const valid=matches();view={wallet:current?.wallet??null,session:valid?rawSession:null,matches:valid,busy:!!pending,checking:!!current&&!checked,error,tick};for(const listener of listeners)listener();};
  const alive=connection=>current===connection&&!connection.controller.signal.aborted;
  const automatic=()=>{
    const key=current?.wallet.toLowerCase();
    if(current&&checked&&(!error||retryAfter.has(key))&&!matches()&&!pending&&!suppressed.has(key)&&now()>=(retryAfter.get(key)||0)&&isActive())void signIn();
  };
  async function refresh(){
    const connection=current;if(!connection||pending===connection||connection.reading)return;
    connection.reading=true;
    try{const result=await read('/session',undefined,connection.controller.signal);if(alive(connection)){rawSession=result.session;checked=true;error='';publish();automatic();}}
    catch(e){if(alive(connection)){checked=true;error=e.message;publish();}}
    finally{connection.reading=false;}
  }
  async function signIn(){
    const connection=current;if(!connection||pending||matches())return;
    pending=connection;suppressed.delete(connection.wallet.toLowerCase());error='';publish();
    const {wallet,provider,controller}=connection,signal=controller.signal;
    const identity=async()=>{
      signal.throwIfAborted();
      const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
      signal.throwIfAborted();
      if(!alive(connection)||accounts[0]?.toLowerCase()!==wallet.toLowerCase()||BigInt(chain)!==143n)throw new Error('Use the selected wallet on Monad Mainnet.');
    };
    try{
      await identity();const challenge=await read('/auth/challenge',{wallet},signal);signal.throwIfAborted();
      const hex='0x'+Array.from(new TextEncoder().encode(challenge.message),byte=>byte.toString(16).padStart(2,'0')).join('');
      const signature=await provider.request({method:'personal_sign',params:[hex,wallet]});await identity();
      const result=await read('/auth/verify',{...challenge,signature},signal);
      if(alive(connection)){rawSession=result.session;if(!matches())throw new Error('Wallet sign-in could not be confirmed. Please try again.');checked=true;retryAfter.delete(wallet.toLowerCase());error='';}
    }catch(e){if(alive(connection)){
      const cancelled=e.code===4001||e.code==='ACTION_REJECTED';
      error=cancelled?'Sign-in is required. Your wallet will ask again shortly.':e.message;
      retryAfter.set(wallet.toLowerCase(),now()+(cancelled?2000:5000));
    }}
    finally{pending=null;publish();if(current!==connection)automatic();}
  }
  async function signOut(){
    const connection=current;if(!connection||pending)return;
    suppressed.add(connection.wallet.toLowerCase());pending=connection;publish();
    try{await read('/auth/logout',{},connection.controller.signal);if(alive(connection)){rawSession=null;error='';}}
    catch(e){if(alive(connection))error=e.message;}
    finally{pending=null;publish();if(current!==connection)automatic();}
  }
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},snapshot:()=>view,
    connect(wallet,provider){if(current?.wallet===wallet&&current?.provider===provider)return;current?.controller.abort();current=wallet&&provider?{wallet,provider,controller:new AbortController(),reading:false}:null;rawSession=null;checked=false;error='';publish();if(current)void refresh();},
    refresh,signIn,signOut,tick(){tick++;if(view.matches!==matches()||tick%10===0)publish();automatic();},
  };
}

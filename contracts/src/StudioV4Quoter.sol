// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StudioV4LiquidityLock, IV4PoolManager} from "./StudioV4LiquidityLock.sol";
import {StudioCurveMarket} from "./StudioCurveMarket.sol";
import {StudioTokenFactory} from "./StudioTokenFactory.sol";
import {StudioFeeVault} from "./StudioFeeVault.sol";

/// @notice Exact-input quotes for the bound Foundry pool. Undeployed, unaudited.
/// Simulated swap and funded hook credits revert together; no settlement or token pull.
contract StudioV4Quoter is ReentrancyGuard {
    StudioV4LiquidityLock public immutable liquidityLock;
    IV4PoolManager public immutable poolManager;
    address public immutable market;
    address public immutable factory;
    address public immutable quoteAsset;
    bytes32 private pending;
    struct Report { uint256 input; uint256 output; uint256 quoteBase; uint256 creatorFee; uint256 studioFee; uint256 platformFee; uint256 lpFeeUnits; }
    error InvalidConfiguration();
    error InvalidAmount();
    error Unauthorized();
    error UnexpectedSimulation();
    error Quote(uint256 input, uint256 output, uint256 base, uint256 creator, uint256 studio, uint256 platform, uint256 lpFee);
    constructor(StudioV4LiquidityLock lock_) {
        if(address(lock_).code.length==0) revert InvalidConfiguration();
        liquidityLock=lock_;poolManager=lock_.poolManager();market=lock_.market();quoteAsset=address(lock_.quote());
        factory=StudioCurveMarket(market).factory();
        if(address(poolManager).code.length==0 || address(StudioTokenFactory(factory).market())!=market
            || address(StudioTokenFactory(factory).quote())!=quoteAsset) revert InvalidConfiguration();
    }
    function quoteExactInput(address token, bool quoteIn, uint256 amount, uint160 priceLimit) external nonReentrant returns(Report memory report) {
        if(amount==0 || amount>uint256(uint128(type(int128).max))) revert InvalidAmount();
        bytes memory data=abi.encode(token,quoteIn,amount,priceLimit);
        pending=keccak256(data);
        try poolManager.unlock(data) returns(bytes memory) {revert UnexpectedSimulation();}
        catch(bytes memory reason) {
            pending=bytes32(0);
            bytes4 selector;
            if(reason.length==228) {assembly ("memory-safe") {selector:=mload(add(reason,32))}}
            if(selector!=Quote.selector) {assembly ("memory-safe") {revert(add(reason,32),mload(reason))}}
            bytes memory payload=new bytes(224);
            for(uint256 i=0;i<224;i+=32) {assembly ("memory-safe") {mstore(add(add(payload,32),i),mload(add(add(reason,36),i)))}}
            report=abi.decode(payload,(Report));
        }
    }
    function unlockCallback(bytes calldata data) external returns(bytes memory) {
        if(msg.sender!=address(poolManager) || pending==bytes32(0) || pending!=keccak256(data)) revert Unauthorized();
        (address token,bool quoteIn,uint256 amount,uint160 priceLimit)=abi.decode(data,(address,bool,uint256,uint160));
        IV4PoolManager.PoolKey memory key=liquidityLock.poolKey(token);
        (bytes32 poolId,,uint128 liquidity,,,,)=liquidityLock.positions(token);
        if(liquidity==0 || poolId!=keccak256(abi.encode(key))) revert InvalidConfiguration();
        StudioFeeVault vault=StudioTokenFactory(factory).feeVault();
        bytes32 launchId=vault.launchForToken(token);
        (address registeredToken,,address creator,,)=vault.launches(launchId);
        if(registeredToken!=token || launchId==bytes32(0)) revert InvalidConfiguration();
        address treasury=vault.treasury();uint256 totalBefore=vault.totalCredited();
        (uint256 creatorBefore,,)=vault.credits(creator);
        (,,uint256 platformBefore)=vault.credits(treasury);
        address input=quoteIn?quoteAsset:token;
        bool zeroForOne=input==key.currency0;
        if(priceLimit==0) priceLimit=zeroForOne?uint160(4295128740):uint160(1461446703485210103287273052203988822378723970341);
        int256 delta=poolManager.swap(key,IV4PoolManager.SwapParams(zeroForOne,-int256(amount),priceLimit),'');
        int128 d0=int128(delta>>128);int128 d1=int128(delta);
        int128 spentDelta=zeroForOne?d0:d1;int128 outputDelta=zeroForOne?d1:d0;
        if(spentDelta>=0 || outputDelta<=0) revert InvalidAmount();
        uint256 spent=uint256(-int256(spentDelta));uint256 output=uint256(int256(outputDelta));
        if(spent>amount) revert InvalidAmount();
        (uint256 creatorAfter,,)=vault.credits(creator);
        (,,uint256 platformAfter)=vault.credits(treasury);
        uint256 cf=creatorAfter-creatorBefore;uint256 pf=platformAfter-platformBefore;
        uint256 fee=vault.totalCredited()-totalBefore;uint256 sf=fee-cf-pf;
        uint256 base=quoteIn?spent-fee:output+fee;
        revert Quote(spent,output,base,cf,sf,pf,key.fee);
    }
}

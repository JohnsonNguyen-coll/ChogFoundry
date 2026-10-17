// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ABI subset of Pyth IEntropyV2; deployment/provider must be independently verified.
interface IFoundryEntropy {
 function getFeeV2(address provider,uint32 gasLimit) external view returns(uint128);
 function requestV2(address provider,bytes32 userRandomNumber,uint32 gasLimit) external payable returns(uint64);
}
/// @notice One NFT prize per campaign. Eligibility/points are public offchain records.
/// @dev Undeployed/unaudited. Organizer commits one immutable list before a later draw.
contract FoundryRaffle is IERC721Receiver, ReentrancyGuard {
 IERC721 public immutable collection;
 IFoundryEntropy public immutable entropy;
 address public immutable provider;
 address public immutable organizer;
 uint32 public constant CALLBACK_GAS = 100000;
 struct Campaign { uint256 tokenId; uint64 closesAt; bytes32 rulesHash; bytes32 root; bytes32 manifestHash; uint32 entries; uint64 committedBlock; uint64 sequence; bytes32 randomness; bool exists; bool ready; bool claimed; bool cancelled; }
 mapping(bytes32=>Campaign) public campaigns;
 mapping(uint64=>bytes32) public requestCampaign;
 mapping(uint256=>bool) public reserved;
 error Unauthorized(); error InvalidState(); error InvalidInput();
 event Created(bytes32 indexed id,uint256 indexed tokenId,uint64 closesAt,bytes32 rulesHash);
 event Committed(bytes32 indexed id,bytes32 root,uint32 entries,bytes32 manifestHash);
 event Requested(bytes32 indexed id,uint64 sequence);
 event RandomnessReceived(bytes32 indexed id,uint64 sequence,bytes32 randomness);
 event Awarded(bytes32 indexed id,address indexed winner,uint256 indexed tokenId,uint256 entryIndex);
 event Cancelled(bytes32 indexed id);
 constructor(IERC721 collection_,IFoundryEntropy entropy_,address provider_,address organizer_) {
  if(address(collection_).code.length==0||address(entropy_).code.length==0||provider_==address(0)||organizer_==address(0)) revert InvalidInput();
  collection=collection_;entropy=entropy_;provider=provider_;organizer=organizer_;
 }
 modifier onlyOrganizer(){if(msg.sender!=organizer)revert Unauthorized();_;}
 function create(bytes32 id,uint256 tokenId,uint64 closesAt,bytes32 rulesHash) external onlyOrganizer nonReentrant {
  if(id==bytes32(0)||rulesHash==bytes32(0)||campaigns[id].exists||reserved[tokenId]||closesAt<=block.timestamp)revert InvalidInput();
  Campaign storage c=campaigns[id];c.tokenId=tokenId;c.closesAt=closesAt;c.rulesHash=rulesHash;c.exists=true;reserved[tokenId]=true;
  collection.safeTransferFrom(msg.sender,address(this),tokenId);
  emit Created(id,tokenId,closesAt,rulesHash);
 }
 function commit(bytes32 id,bytes32 root,uint32 entries,bytes32 manifestHash) external onlyOrganizer {
  Campaign storage c=campaigns[id];
  if(!c.exists||c.cancelled||c.root!=bytes32(0)||block.timestamp<c.closesAt||root==bytes32(0)||manifestHash==bytes32(0)||entries==0||entries>5000)revert InvalidState();
  c.root=root;c.entries=entries;c.manifestHash=manifestHash;c.committedBlock=uint64(block.number);
  emit Committed(id,root,entries,manifestHash);
 }
 function drawFee() external view returns(uint128){return entropy.getFeeV2(provider,CALLBACK_GAS);}
 function requestDraw(bytes32 id,bytes32 userRandomNumber) external payable onlyOrganizer nonReentrant {
  Campaign storage c=campaigns[id];
  if(c.root==bytes32(0)||c.cancelled||c.sequence!=0||block.number<=c.committedBlock||userRandomNumber==bytes32(0))revert InvalidState();
  uint128 fee=entropy.getFeeV2(provider,CALLBACK_GAS);if(msg.value!=fee)revert InvalidInput();
  uint64 sequence=entropy.requestV2{value:fee}(provider,userRandomNumber,CALLBACK_GAS);
  if(sequence==0||requestCampaign[sequence]!=bytes32(0))revert InvalidState();
  c.sequence=sequence;requestCampaign[sequence]=id;emit Requested(id,sequence);
 }
 // Pyth calls this exact consumer entry point. Callback stores only; no NFT transfer.
 function _entropyCallback(uint64 sequence,address source,bytes32 randomNumber) external {
  if(msg.sender!=address(entropy))revert Unauthorized();
  bytes32 id=requestCampaign[sequence];Campaign storage c=campaigns[id];
  if(source!=provider||id==bytes32(0)||c.sequence!=sequence||c.ready)return;
  c.randomness=randomNumber;c.ready=true;emit RandomnessReceived(id,sequence,randomNumber);
 }
 function winnerIndex(bytes32 id) public view returns(uint256){
  Campaign storage c=campaigns[id];if(!c.ready)revert InvalidState();
  // Rejection sampling avoids modulo bias; retry derivation is fixed, never organizer-selected.
  uint256 n=c.entries;uint256 threshold;unchecked{threshold=(0-n)%n;}
  uint256 value=uint256(c.randomness);uint256 i;
  while(value<threshold){value=uint256(keccak256(abi.encode(c.randomness,++i)));}
  return value%n;
 }
 function claim(bytes32 id,uint256 index,address winner,bytes32[] calldata proof) external nonReentrant {
  Campaign storage c=campaigns[id];if(c.claimed||c.cancelled||winner==address(0)||winnerIndex(id)!=index)revert InvalidState();
  bytes32 leaf=keccak256(bytes.concat(keccak256(abi.encode(block.chainid,address(this),id,index,winner))));
  if(!MerkleProof.verifyCalldata(proof,c.root,leaf))revert InvalidInput();
  c.claimed=true;reserved[c.tokenId]=false;
  // Anyone can deliver, but the NFT always goes to the committed winning wallet.
  collection.transferFrom(address(this),winner,c.tokenId);emit Awarded(id,winner,c.tokenId,index);
 }
 function cancel(bytes32 id) external onlyOrganizer nonReentrant {
  Campaign storage c=campaigns[id];if(!c.exists||c.cancelled||c.root!=bytes32(0))revert InvalidState();
  c.cancelled=true;reserved[c.tokenId]=false;collection.transferFrom(address(this),organizer,c.tokenId);emit Cancelled(id);
 }
 function onERC721Received(address operator,address,uint256,bytes calldata) external view returns(bytes4){
  if(msg.sender!=address(collection)||operator!=address(this))revert Unauthorized();return IERC721Receiver.onERC721Received.selector;
 }
}

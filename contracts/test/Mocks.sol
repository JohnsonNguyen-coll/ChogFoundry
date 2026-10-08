// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

// Deliberately incomplete ERC-721 fixture; not a deployable Chog collection/template.
contract MockChog {
    mapping(uint256 => address) private owners;
    mapping(uint256 => address) public getApproved;
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    function mint(address to, uint256 id) external {
        require(to != address(0) && owners[id] == address(0), "invalid mint");
        owners[id] = to; emit Transfer(address(0), to, id);
    }
    function ownerOf(uint256 id) public view returns (address) {
        require(owners[id] != address(0), "unknown NFT"); return owners[id];
    }
    function approve(address operator, uint256 id) external {
        require(msg.sender == ownerOf(id), "owner required"); getApproved[id] = operator;
    }
    function transferFrom(address from, address to, uint256 id) external {
        require(from == ownerOf(id) && to != address(0), "invalid transfer");
        require(msg.sender == from || msg.sender == getApproved[id], "not authorized");
        owners[id] = to; delete getApproved[id]; emit Transfer(from, to, id);
    }
    function burn(uint256 id) external {
        require(msg.sender == ownerOf(id), "owner required");
        delete owners[id]; delete getApproved[id]; emit Transfer(msg.sender, address(0), id);
    }
}

// Arbitrary test supply, optional failure/tax. NOT $CHOG and NOT a launch token template.
contract MockQuote {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;
    bool public taxTransfers;
    function mint(address wallet, uint256 amount) external { balanceOf[wallet] += amount; }
    function setFailure(bool value) external { failTransfers = value; }
    function setTax(bool value) external { taxTransfers = value; }
    function approve(address to, uint256 amount) external returns (bool) { allowance[msg.sender][to] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount;
        balanceOf[to] += taxTransfers ? amount - 1 : amount; return true;
    }
}


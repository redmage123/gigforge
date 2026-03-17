"""NFT portfolio — fetch NFTs from saved wallets via Etherscan NFT transfer API."""

from services.blockchain.etherscan import get_nft_transfers


async def get_nfts_for_address(chain: str, address: str) -> list[dict]:
    """Get NFTs currently held by an address."""
    try:
        transfers = await get_nft_transfers(chain, address, limit=200)
    except Exception:
        return []

    # Track NFT ownership from transfers
    # Key: (contract, tokenId) -> owner
    owned: dict[tuple, dict] = {}
    addr_lower = address.lower()

    for tx in sorted(transfers, key=lambda t: int(t.get("timeStamp", "0"))):
        key = (tx.get("contractAddress", ""), tx.get("tokenID", ""))
        if tx.get("to", "").lower() == addr_lower:
            owned[key] = {
                "contract": tx.get("contractAddress", ""),
                "token_id": tx.get("tokenID", ""),
                "name": tx.get("tokenName", "Unknown Collection"),
                "symbol": tx.get("tokenSymbol", "NFT"),
                "chain": chain,
            }
        elif tx.get("from", "").lower() == addr_lower:
            owned.pop(key, None)

    return list(owned.values())


async def get_all_nfts(wallets: list[dict]) -> list[dict]:
    """Get NFTs across all saved wallets."""
    all_nfts = []
    for w in wallets:
        chain = w.get("chain", "ethereum")
        if chain in ("solana", "bitcoin"):
            continue  # NFT scanning only for EVM chains
        try:
            nfts = await get_nfts_for_address(chain, w["address"])
            for nft in nfts:
                nft["wallet_label"] = w.get("label", "")
            all_nfts.extend(nfts)
        except Exception:
            continue
    return all_nfts

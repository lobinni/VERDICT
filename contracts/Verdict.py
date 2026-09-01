# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from typing import NoReturn

from genlayer import *


DAY = 86400
GEN = u256(10**18)
MIN_POSITION = GEN
MAX_POSITION = u256(10) * GEN
MAX_FORWARD_DAYS = 366
MAX_PAGE = 50
MAX_SOURCE_ROWS = 50
MAX_SOURCE_BYTES = 60000
PRICE_SCALE = 10**8
BPS = u256(10000)

OPEN = "OPEN"
LOCKED = "LOCKED"
RESOLVED = "RESOLVED"
UP = "UP"
DOWN = "DOWN"
INCONCLUSIVE = "INCONCLUSIVE"
NONE = "NONE"

EXPECTED = "[EXPECTED]"
EXTERNAL = "[EXTERNAL]"
TRANSIENT = "[TRANSIENT]"
INVARIANT = EXPECTED + " accounting invariant"

FETCH_OK = "OK"
VALID = "VALID"
MISSING = "MISSING"
UNAVAILABLE = "UNAVAILABLE"
MALFORMED = "MALFORMED"
WRONG_TIMESTAMP = "WRONG_TIMESTAMP"
INCOMPLETE = "INCOMPLETE"
EQUAL = "EQUAL"
EXPECTED_ERROR = "EXPECTED_ERROR"
EXTERNAL_ERROR = "EXTERNAL_ERROR"
TRANSIENT_ERROR = "TRANSIENT_ERROR"

SUPPORTED_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT")
SYMBOL_NAMES = {
    "BTCUSDT": "Bitcoin",
    "ETHUSDT": "Ethereum",
    "SOLUSDT": "Solana",
    "BNBUSDT": "BNB",
}
BINANCE_URL = "https://fapi.binance.com/fapi/v1/klines"
BITGET_URL = "https://api.bitget.com/api/v2/mix/market/candles"
BITGET_PRODUCT = "USDT-FUTURES"
BITGET_GRANULARITY = "1Dutc"


@allow_storage
@dataclass
class MarketRecord:
    market_id: u256
    symbol: str
    market_date: str
    opens_at: u256
    settles_at: u256
    state: str
    resolution: str
    up_total: u256
    down_total: u256
    pool: u256
    paid_out: u256
    refund_all: bool
    created_at: str
    evidence_key: str


@allow_storage
@dataclass
class PositionRecord:
    market_id: u256
    owner: Address
    side: str
    stake: u256
    claimed: bool


@allow_storage
@dataclass
class SettlementEvidence:
    market_id: u256
    symbol: str
    market_date: str
    expected_candle_timestamp: u256
    binance_timestamp: u256
    binance_open: u256
    binance_close: u256
    binance_direction: str
    binance_status: str
    bitget_timestamp: u256
    bitget_open: u256
    bitget_close: u256
    bitget_direction: str
    bitget_status: str
    resolution: str
    recorded_at: str


def _err(kind: str, message: str) -> NoReturn:
    raise gl.vm.UserError(kind + " " + message)


def _failure(status: str) -> dict:
    return {
        "status": status,
        "timestamp": "0",
        "open": "0",
        "close": "0",
        "direction": INCONCLUSIVE,
    }


def _source_result(status: str, timestamp: int, opened: int, closed: int) -> dict:
    direction = UP if closed > opened else DOWN if closed < opened else INCONCLUSIVE
    if direction == INCONCLUSIVE and status == VALID:
        status = EQUAL
    return {
        "status": status,
        "timestamp": str(timestamp),
        "open": str(opened),
        "close": str(closed),
        "direction": direction,
    }


def _request_json(url: str, source: str) -> dict:
    try:
        response = gl.nondet.web.get(url)
    except gl.vm.UserError as error:
        message = str(getattr(error, "message", error))
        if message.startswith(EXTERNAL):
            return _failure(EXTERNAL_ERROR)
        if message.startswith(TRANSIENT):
            return _failure(TRANSIENT_ERROR)
        if message.startswith(EXPECTED):
            return _failure(EXPECTED_ERROR)
        return _failure(TRANSIENT_ERROR)
    except Exception:
        return _failure(TRANSIENT_ERROR)

    status = getattr(response, "status", 0) if response is not None else 0
    if status <= 0 or status in (408, 425, 429) or status >= 500:
        return _failure(TRANSIENT_ERROR)
    if status != 200:
        return _failure(EXTERNAL_ERROR)
    body = getattr(response, "body", None)
    if isinstance(body, str):
        raw = body.encode("utf-8")
    elif isinstance(body, (bytes, bytearray)):
        raw = bytes(body)
    else:
        return _failure(MALFORMED)
    if len(raw) == 0 or len(raw) > MAX_SOURCE_BYTES:
        return _failure(MALFORMED)
    try:
        payload = json.loads(raw.decode("utf-8"), parse_int=str, parse_float=str)
    except Exception:
        return _failure(MALFORMED)
    return {"status": FETCH_OK, "payload": payload, "source": source}


def _same_result(leader: dict, validator: dict) -> bool:
    fields = (
        "market_id", "symbol", "market_date", "expected_candle_timestamp",
        "binance_timestamp", "binance_open", "binance_close",
        "binance_direction", "binance_status", "bitget_timestamp",
        "bitget_open", "bitget_close", "bitget_direction", "bitget_status",
        "resolution",
    )
    return all(leader.get(field) == validator.get(field) for field in fields)


class Verdict(gl.Contract):
    market_count: u256
    markets: TreeMap[u256, MarketRecord]
    market_keys: TreeMap[str, u256]
    positions: TreeMap[str, PositionRecord]
    user_market_count: TreeMap[str, u256]
    user_market_index: TreeMap[str, u256]
    settlement_evidence: TreeMap[u256, SettlementEvidence]

    def __init__(self):
        self.market_count = u256(0)

    @gl.public.write
    def open_market(self, symbol: str, market_date: str) -> u256:
        clean_symbol = str(symbol).strip().upper()
        self._symbol(clean_symbol)
        target = self._date(market_date)
        now = self._now()
        if target <= now:
            _err(EXPECTED, "market date must be in the future")
        if target > now + MAX_FORWARD_DAYS * DAY:
            _err(EXPECTED, "market date is too far ahead")
        canonical = self._date_text(target)
        key = clean_symbol + "|" + str(int(target))
        if key in self.market_keys:
            _err(EXPECTED, "duplicate market")
        market_id = self.market_count
        self.markets[market_id] = MarketRecord(
            market_id, clean_symbol, canonical, target, target + DAY,
            OPEN, NONE, u256(0), u256(0), u256(0), u256(0), False,
            str(gl.message_raw["datetime"]), "",
        )
        self.market_keys[key] = market_id
        self.market_count += u256(1)
        return market_id

    @gl.public.write
    def close_entries(self, market_id: u256) -> None:
        market = self._market(market_id)
        if market.state != OPEN:
            _err(EXPECTED, "entries already closed")
        if self._now() < market.opens_at:
            _err(EXPECTED, "entry window is still open")
        market.state = LOCKED
        self.markets[market_id] = market

    @gl.public.write.payable
    def take_position(self, market_id: u256, side: str) -> None:
        market = self._market(market_id)
        if market.state != OPEN or self._now() >= market.opens_at:
            _err(EXPECTED, "entries closed")
        chosen = str(side).strip().upper()
        if chosen not in (UP, DOWN):
            _err(EXPECTED, "invalid position side")
        amount = gl.message.value
        if amount < MIN_POSITION:
            _err(EXPECTED, "minimum position is 1 GEN")

        wallet = self._sender()
        key = str(int(market_id)) + "|" + wallet
        current = self.positions.get(key)
        current_stake = u256(0)
        if current is not None:
            if current.claimed:
                _err(EXPECTED, "position already claimed")
            if current.side != chosen:
                _err(EXPECTED, "opposite position already selected")
            current_stake = current.stake
        if current_stake + amount > MAX_POSITION:
            _err(EXPECTED, "maximum position is 10 GEN")

        # All validation is complete before any storage mutation.
        if current is None:
            current = PositionRecord(
                market_id, gl.message.sender_address, chosen, amount, False,
            )
            index = self.user_market_count.get(wallet, u256(0))
            self.user_market_index[wallet + "|" + str(int(index))] = market_id
            self.user_market_count[wallet] = index + u256(1)
        else:
            current.stake = current_stake + amount
        self.positions[key] = current
        if chosen == UP:
            market.up_total += amount
        else:
            market.down_total += amount
        market.pool += amount
        self.markets[market_id] = market

    @gl.public.write
    def resolve_market(self, market_id: u256) -> str:
        market = self._market(market_id)
        if market.state == RESOLVED:
            _err(EXPECTED, "market already resolved")
        if self._now() < market.settles_at:
            _err(EXPECTED, "settlement is not eligible")

        result = self._consensus_result(market)
        evidence = SettlementEvidence(
            market_id,
            result["symbol"],
            result["market_date"],
            u256(int(result["expected_candle_timestamp"])),
            u256(int(result["binance_timestamp"])),
            u256(int(result["binance_open"])),
            u256(int(result["binance_close"])),
            result["binance_direction"],
            result["binance_status"],
            u256(int(result["bitget_timestamp"])),
            u256(int(result["bitget_open"])),
            u256(int(result["bitget_close"])),
            result["bitget_direction"],
            result["bitget_status"],
            result["resolution"],
            str(gl.message_raw["datetime"]),
        )
        market.state = RESOLVED
        market.resolution = result["resolution"]
        market.refund_all = result["resolution"] == INCONCLUSIVE
        if result["resolution"] == UP and market.up_total == u256(0):
            market.refund_all = True
        if result["resolution"] == DOWN and market.down_total == u256(0):
            market.refund_all = True
        market.evidence_key = str(int(market_id))
        self.settlement_evidence[market_id] = evidence
        self.markets[market_id] = market
        return market.resolution

    @gl.public.write
    def claim(self, market_id: u256) -> u256:
        market = self._market(market_id)
        if market.state != RESOLVED:
            _err(EXPECTED, "market is not resolved")
        key = str(int(market_id)) + "|" + self._sender()
        position = self.positions.get(key)
        if position is None or position.claimed or position.stake == u256(0):
            _err(EXPECTED, "nothing claimable")
        amount = self._claimable(market, position)
        if amount == u256(0):
            _err(EXPECTED, "position did not win")
        if market.paid_out > market.pool or amount > market.pool - market.paid_out:
            _err(INVARIANT, "payout exceeds pool")
        position.claimed = True
        market.paid_out += amount
        self.positions[key] = position
        self.markets[market_id] = market
        gl.get_contract_at(position.owner).emit_transfer(value=amount, on="finalized")
        return amount

    @gl.public.view
    def get_market(self, market_id: u256) -> dict:
        return self._market_view(market_id, self._market(market_id))

    @gl.public.view
    def get_market_summary(self, market_id: u256) -> dict:
        market = self._market(market_id)
        return self._market_summary(market_id, market, self._now())

    @gl.public.view
    def get_market_status(self, market_id: u256) -> str:
        return self._phase(self._market(market_id), self._now())

    @gl.public.view
    def get_market_timing(self, market_id: u256) -> dict:
        market = self._market(market_id)
        return {
            "market_id": int(market_id),
            "market_date": market.market_date,
            "opens_at": int(market.opens_at),
            "settles_at": int(market.settles_at),
            "expected_candle_timestamp": int(market.opens_at),
        }

    @gl.public.view
    def get_current_market(self, symbol: str) -> dict:
        clean_symbol = str(symbol).strip().upper()
        self._symbol(clean_symbol)
        start = self._day_start(self._now())
        market_id = self.market_keys.get(clean_symbol + "|" + str(int(start)))
        if market_id is None:
            return {"found": False, "symbol": clean_symbol, "market_date": self._date_text(start)}
        return {"found": True, "market": self._market_summary(
            market_id, self._market(market_id), self._now(),
        )}

    @gl.public.view
    def get_user_market(self, market_id: u256, wallet: str) -> dict:
        return self._user_market_view(market_id, self._normalize_address(wallet))

    @gl.public.view
    def get_remaining_position_capacity(self, market_id: u256, wallet: str) -> u256:
        self._market(market_id)
        owner = self._normalize_address(wallet)
        position = self.positions.get(str(int(market_id)) + "|" + owner)
        used = u256(0) if position is None else position.stake
        return u256(0) if used >= MAX_POSITION else MAX_POSITION - used

    @gl.public.view
    def get_user_stake(self, market_id: u256, wallet: str, side: str) -> u256:
        self._market(market_id)
        chosen = str(side).strip().upper()
        if chosen not in (UP, DOWN):
            _err(EXPECTED, "invalid position side")
        owner = self._normalize_address(wallet)
        position = self.positions.get(str(int(market_id)) + "|" + owner)
        return u256(0) if position is None or position.side != chosen else position.stake

    @gl.public.view
    def get_market_pools(self, market_id: u256) -> dict:
        market = self._market(market_id)
        return {
            "market_id": int(market_id),
            "up_total": int(market.up_total),
            "down_total": int(market.down_total),
            "pool": int(market.pool),
            "paid_out": int(market.paid_out),
        }

    @gl.public.view
    def get_position(self, market_id: u256, wallet: str) -> dict:
        return self._position_view(market_id, self._normalize_address(wallet))

    @gl.public.view
    def get_claimable(self, market_id: u256, wallet: str) -> u256:
        return self._claimable_for_wallet(market_id, self._normalize_address(wallet))

    @gl.public.view
    def is_claimable(self, market_id: u256, wallet: str) -> bool:
        return self.get_claimable(market_id, wallet) > u256(0)

    @gl.public.view
    def has_claimed(self, market_id: u256, wallet: str) -> bool:
        self._market(market_id)
        position = self.positions.get(str(int(market_id)) + "|" + self._normalize_address(wallet))
        return position is not None and position.claimed

    @gl.public.view
    def get_claim_estimate(self, market_id: u256, wallet: str) -> dict:
        owner = self._normalize_address(wallet)
        market = self._market(market_id)
        position = self.positions.get(str(int(market_id)) + "|" + owner)
        amount = u256(0) if position is None else self._claimable(market, position)
        return {
            "market_id": int(market_id),
            "wallet": owner,
            "claimable": int(amount),
            "refund": amount > u256(0) and (market.refund_all or market.resolution == INCONCLUSIVE),
            "claimed": position is not None and position.claimed,
        }

    @gl.public.view
    def get_refund_eligibility(self, market_id: u256, wallet: str) -> dict:
        return self.get_claim_estimate(market_id, wallet)

    @gl.public.view
    def get_market_count(self) -> u256:
        return self.market_count

    @gl.public.view
    def get_markets(self, offset: u256, limit: u256) -> dict:
        start, end, size = self._page(offset, limit, int(self.market_count))
        items = []
        for index in range(start, end):
            market_id = u256(index)
            items.append(self._market_view(market_id, self._market(market_id)))
        return {"offset": start, "limit": size, "total": int(self.market_count), "has_more": end < int(self.market_count), "next_offset": end, "markets": items}

    @gl.public.view
    def get_open_markets(self, offset: u256, limit: u256) -> dict:
        start, end, size = self._page(offset, limit, int(self.market_count))
        now = self._now()
        items = []
        for index in range(start, end):
            market_id = u256(index)
            market = self._market(market_id)
            if market.state == OPEN and now < market.opens_at:
                items.append(self._market_summary(market_id, market, now))
        total = int(self.market_count)
        return {"offset": start, "limit": size, "total": total, "has_more": end < total, "next_offset": end, "markets": items}

    @gl.public.view
    def get_ready_to_settle_markets(self, offset: u256, limit: u256) -> dict:
        start, end, size = self._page(offset, limit, int(self.market_count))
        now = self._now()
        items = []
        for index in range(start, end):
            market_id = u256(index)
            market = self._market(market_id)
            if market.state != RESOLVED and now >= market.settles_at:
                items.append(self._market_summary(market_id, market, now))
        total = int(self.market_count)
        return {"offset": start, "limit": size, "total": total, "has_more": end < total, "next_offset": end, "markets": items}

    @gl.public.view
    def get_user_positions(self, wallet: str, offset: u256, limit: u256) -> dict:
        owner = self._normalize_address(wallet)
        total = int(self.user_market_count.get(owner, u256(0)))
        start, end, size = self._page(offset, limit, total)
        now = self._now()
        positions = []
        for index in range(start, end):
            market_id = self.user_market_index[owner + "|" + str(index)]
            market = self._market(market_id)
            user_market = self._user_market_view(market_id, owner)
            positions.append({
                "market_id": int(market_id), "symbol": market.symbol,
                "name": SYMBOL_NAMES[market.symbol], "market_date": market.market_date,
                "side": user_market["side"], "stake": user_market["stake"],
                "state": market.state, "phase": self._phase(market, now),
                "resolution": market.resolution, "result": user_market["result"],
                "claimable": user_market["claimable"], "claimed": user_market["claimed"],
            })
        return {"offset": start, "limit": size, "total": total, "has_more": end < total, "next_offset": end, "positions": positions}

    @gl.public.view
    def get_user_market_ids(self, wallet: str, offset: u256, limit: u256) -> dict:
        owner = self._normalize_address(wallet)
        total = int(self.user_market_count.get(owner, u256(0)))
        start, end, size = self._page(offset, limit, total)
        ids = []
        for index in range(start, end):
            ids.append(int(self.user_market_index[owner + "|" + str(index)]))
        return {"offset": start, "limit": size, "total": total, "has_more": end < total, "next_offset": end, "market_ids": ids}

    @gl.public.view
    def get_claimable_markets(self, wallet: str, offset: u256, limit: u256) -> dict:
        owner = self._normalize_address(wallet)
        total = int(self.user_market_count.get(owner, u256(0)))
        start, end, size = self._page(offset, limit, total)
        claims = []
        for index in range(start, end):
            market_id = self.user_market_index[owner + "|" + str(index)]
            market = self._market(market_id)
            position = self.positions.get(str(int(market_id)) + "|" + owner)
            if position is None or position.claimed:
                continue
            claimable = self._claimable(market, position)
            if claimable == u256(0):
                continue
            claims.append({
                "market_id": int(market_id), "symbol": market.symbol,
                "name": SYMBOL_NAMES[market.symbol], "market_date": market.market_date,
                "side": position.side, "stake": int(position.stake),
                "resolution": market.resolution, "claimable": int(claimable),
                "claim_type": "REFUND" if market.refund_all or market.resolution == INCONCLUSIVE else "WINNINGS",
            })
        return {"offset": start, "limit": size, "total": total, "has_more": end < total, "next_offset": end, "claims": claims}

    @gl.public.view
    def get_resolved_outcome(self, market_id: u256) -> str:
        return self._market(market_id).resolution

    @gl.public.view
    def get_settlement_evidence(self, market_id: u256) -> dict:
        self._market(market_id)
        evidence = self.settlement_evidence.get(market_id)
        if evidence is None:
            _err(EXPECTED, "settlement evidence unavailable")
        return {
            "market_id": int(evidence.market_id), "symbol": evidence.symbol,
            "market_date": evidence.market_date,
            "expected_candle_timestamp": int(evidence.expected_candle_timestamp),
            "binance_timestamp": int(evidence.binance_timestamp),
            "binance_open": int(evidence.binance_open),
            "binance_close": int(evidence.binance_close),
            "binance_direction": evidence.binance_direction,
            "binance_status": evidence.binance_status,
            "bitget_timestamp": int(evidence.bitget_timestamp),
            "bitget_open": int(evidence.bitget_open),
            "bitget_close": int(evidence.bitget_close),
            "bitget_direction": evidence.bitget_direction,
            "bitget_status": evidence.bitget_status,
            "resolution": evidence.resolution,
            "recorded_at": evidence.recorded_at,
        }

    @gl.public.view
    def get_supported_symbols(self) -> list:
        return list(SUPPORTED_SYMBOLS)

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "name": "Verdict", "version": "1.0.0",
            "market_kind": "DAILY_CANDLE_DIRECTION",
            "symbols": list(SUPPORTED_SYMBOLS), "symbol_names": SYMBOL_NAMES,
            "binance_endpoint": BINANCE_URL, "bitget_endpoint": BITGET_URL,
            "binance_interval": "1d", "bitget_product_type": BITGET_PRODUCT,
            "bitget_granularity": BITGET_GRANULARITY, "price_scale": PRICE_SCALE,
            "min_position": int(MIN_POSITION), "max_position": int(MAX_POSITION),
            "outcomes": [UP, DOWN, INCONCLUSIVE],
            "entry_window": "before market_date UTC midnight",
            "settlement_window": "after market_date UTC midnight plus one day",
            "failure_policy": "missing, unavailable, malformed, wrong-window, or equal sources resolve INCONCLUSIVE",
        }

    def _consensus_result(self, market: MarketRecord) -> dict:
        market_id_value = str(int(market.market_id))
        symbol_value = str(market.symbol)
        market_date_value = str(market.market_date)
        expected_start_value = int(market.opens_at)
        expected_timestamp_value = str(expected_start_value)

        def fetch():
            binance = self._binance(symbol_value, expected_start_value)
            bitget = self._bitget(symbol_value, expected_start_value)
            binance_side = binance["direction"]
            bitget_side = bitget["direction"]
            resolution = (UP if binance_side == UP and bitget_side == UP else
                          DOWN if binance_side == DOWN and bitget_side == DOWN else
                          INCONCLUSIVE)
            return {
                "status": FETCH_OK, "market_id": market_id_value,
                "symbol": symbol_value, "market_date": market_date_value,
                "expected_candle_timestamp": expected_timestamp_value,
                "binance_timestamp": binance["timestamp"],
                "binance_open": binance["open"], "binance_close": binance["close"],
                "binance_direction": binance_side, "binance_status": binance["status"],
                "bitget_timestamp": bitget["timestamp"],
                "bitget_open": bitget["open"], "bitget_close": bitget["close"],
                "bitget_direction": bitget_side, "bitget_status": bitget["status"],
                "resolution": resolution,
            }

        def verify(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader = leader_result.calldata
            if not isinstance(leader, dict) or leader.get("status") != FETCH_OK:
                return False
            try:
                validator = fetch()
                return validator.get("status") == FETCH_OK and _same_result(leader, validator)
            except Exception:
                return False

        return gl.vm.run_nondet_unsafe(fetch, verify)

    def _binance(self, symbol: str, expected_start: int) -> dict:
        start_ms = expected_start * 1000
        url = (BINANCE_URL + "?symbol=" + symbol + "&interval=1d&startTime=" +
               str(start_ms) + "&endTime=" + str(start_ms + DAY * 1000 - 1) + "&limit=1")
        response = _request_json(url, "Binance")
        if response.get("status") != FETCH_OK:
            return _failure(response.get("status", MALFORMED))
        rows = response.get("payload")
        if not isinstance(rows, list) or len(rows) > MAX_SOURCE_ROWS:
            return _failure(MALFORMED)
        if len(rows) == 0:
            return _failure(MISSING)
        selected = None
        saw_row = False
        for row in rows:
            if not isinstance(row, list) or len(row) < 7:
                return _failure(MALFORMED)
            opened = self._whole(row[0])
            closed = self._whole(row[6])
            if opened < 0 or closed < 0:
                return _failure(MALFORMED)
            if opened == start_ms:
                if selected is not None:
                    return _failure(MALFORMED)
                selected = (row, opened, closed)
            else:
                saw_row = True
        if selected is None:
            return _failure(WRONG_TIMESTAMP if saw_row else MISSING)
        row, opened, closed = selected
        if closed != start_ms + DAY * 1000 - 1:
            return _failure(INCOMPLETE)
        opened_price = self._price(row[1])
        closed_price = self._price(row[4])
        if opened_price < 0 or closed_price < 0:
            return _failure(MALFORMED)
        return _source_result(VALID, opened, opened_price, closed_price)

    def _bitget(self, symbol: str, expected_start: int) -> dict:
        start_ms = expected_start * 1000
        url = (BITGET_URL + "?symbol=" + symbol + "&productType=" + BITGET_PRODUCT +
               "&granularity=" + BITGET_GRANULARITY + "&startTime=" + str(start_ms) +
               "&endTime=" + str(start_ms + DAY * 1000 - 1) + "&limit=1")
        response = _request_json(url, "Bitget")
        if response.get("status") != FETCH_OK:
            return _failure(response.get("status", MALFORMED))
        payload = response.get("payload")
        if not isinstance(payload, dict) or payload.get("code") != "00000":
            return _failure(MALFORMED)
        rows = payload.get("data")
        if not isinstance(rows, list) or len(rows) == 0 or len(rows) > MAX_SOURCE_ROWS:
            return _failure(MISSING if isinstance(rows, list) and len(rows) == 0 else MALFORMED)
        selected = None
        saw_row = False
        for row in rows:
            if not isinstance(row, list) or len(row) < 5:
                return _failure(MALFORMED)
            opened = self._whole(row[0])
            if opened < 0:
                return _failure(MALFORMED)
            if opened == start_ms:
                if selected is not None:
                    return _failure(MALFORMED)
                selected = row
            else:
                saw_row = True
        if selected is None:
            return _failure(WRONG_TIMESTAMP if saw_row else MISSING)
        opened_price = self._price(selected[1])
        closed_price = self._price(selected[4])
        if opened_price < 0 or closed_price < 0:
            return _failure(MALFORMED)
        return _source_result(VALID, start_ms, opened_price, closed_price)

    def _market_view(self, market_id: u256, market: MarketRecord) -> dict:
        now = self._now()
        return {
            "market_id": int(market.market_id), "symbol": market.symbol,
            "name": SYMBOL_NAMES[market.symbol], "market_date": market.market_date,
            "expected_candle_timestamp": int(market.opens_at),
            "opens_at": int(market.opens_at), "settles_at": int(market.settles_at),
            "state": market.state, "phase": self._phase(market, now),
            "resolution": market.resolution, "up_total": int(market.up_total),
            "down_total": int(market.down_total), "pool": int(market.pool),
            "paid_out": int(market.paid_out), "refund_all": market.refund_all,
            "entries_open": market.state == OPEN and now < market.opens_at,
            "settlement_eligible": market.state != RESOLVED and now >= market.settles_at,
            "evidence_available": market_id in self.settlement_evidence,
        }

    def _market_summary(self, market_id: u256, market: MarketRecord, now: u256) -> dict:
        up_bps, down_bps = self._pool_bps(market)
        return {
            "market_id": int(market.market_id), "symbol": market.symbol,
            "name": SYMBOL_NAMES[market.symbol], "market_date": market.market_date,
            "expected_candle_timestamp": int(market.opens_at), "state": market.state,
            "phase": self._phase(market, now), "resolution": market.resolution,
            "up_total": int(market.up_total), "down_total": int(market.down_total),
            "pool": int(market.pool), "up_bps": up_bps, "down_bps": down_bps,
            "entries_open": market.state == OPEN and now < market.opens_at,
            "settlement_ready": market.state != RESOLVED and now >= market.settles_at,
            "evidence_available": market_id in self.settlement_evidence,
            "refund_all": market.refund_all,
        }

    def _user_market_view(self, market_id: u256, wallet: str) -> dict:
        market = self._market(market_id)
        position = self.positions.get(str(int(market_id)) + "|" + wallet)
        if position is None:
            return {"market_id": int(market_id), "wallet": wallet, "side": NONE,
                    "stake": 0, "claimed": False, "claimable": 0,
                    "remaining_capacity": int(MAX_POSITION),
                    "result": "NOT_PARTICIPATED", "claim_type": NONE}
        claimable = self._claimable(market, position)
        if market.state != RESOLVED:
            result = "PENDING"
        elif position.claimed:
            result = "CLAIMED"
        elif market.refund_all or market.resolution == INCONCLUSIVE:
            result = "REFUND_AVAILABLE"
        elif claimable > u256(0):
            result = "WON"
        else:
            result = "LOST"
        claim_type = ("REFUND" if claimable > u256(0) and
                      (market.refund_all or market.resolution == INCONCLUSIVE)
                      else "WINNINGS" if claimable > u256(0) else NONE)
        remaining = u256(0) if position.stake >= MAX_POSITION else MAX_POSITION - position.stake
        return {"market_id": int(market_id), "wallet": wallet, "side": position.side,
                "stake": int(position.stake), "claimed": position.claimed,
                "claimable": int(claimable), "remaining_capacity": int(remaining),
                "result": result, "claim_type": claim_type}

    def _position_view(self, market_id: u256, wallet: str) -> dict:
        self._market(market_id)
        position = self.positions.get(str(int(market_id)) + "|" + wallet)
        if position is None:
            return {"market_id": int(market_id), "wallet": wallet, "side": NONE,
                    "stake": 0, "claimed": False, "claimable": 0, "result": "NO_POSITION"}
        market = self._market(market_id)
        claimable = self._claimable(market, position)
        result = "PENDING"
        if market.state == RESOLVED:
            result = ("CLAIMED" if position.claimed else
                      "REFUND" if market.refund_all else
                      "WIN" if claimable else "LOST")
        return {"market_id": int(market_id), "wallet": wallet, "side": position.side,
                "stake": int(position.stake), "claimed": position.claimed,
                "claimable": int(claimable), "result": result}

    def _claimable_for_wallet(self, market_id: u256, wallet: str) -> u256:
        market = self._market(market_id)
        position = self.positions.get(str(int(market_id)) + "|" + wallet)
        return u256(0) if position is None else self._claimable(market, position)

    def _claimable(self, market: MarketRecord, position: PositionRecord) -> u256:
        if market.state != RESOLVED or position.claimed:
            return u256(0)
        if market.refund_all or market.resolution == INCONCLUSIVE:
            return position.stake
        if position.side != market.resolution:
            return u256(0)
        winners = market.up_total if market.resolution == UP else market.down_total
        if winners == u256(0):
            _err(INVARIANT, "missing winning side")
        return market.pool * position.stake // winners

    def _pool_bps(self, market: MarketRecord):
        if market.pool == u256(0):
            return 0, 0
        up_bps = market.up_total * BPS // market.pool
        return int(up_bps), int(BPS - up_bps)

    def _page(self, offset: u256, limit: u256, total: int):
        size = int(limit)
        start = int(offset)
        if size <= 0 or size > MAX_PAGE:
            _err(EXPECTED, "invalid page size")
        if start > total:
            _err(EXPECTED, "invalid page offset")
        return start, min(start + size, total), size

    def _market(self, market_id: u256) -> MarketRecord:
        market = self.markets.get(market_id)
        if market is None:
            _err(EXPECTED, "market not found")
        if market.state not in (OPEN, LOCKED, RESOLVED):
            _err(EXPECTED, "invalid market state")
        return market

    def _symbol(self, value: str) -> None:
        if value not in SUPPORTED_SYMBOLS:
            _err(EXPECTED, "unsupported symbol")

    def _phase(self, market: MarketRecord, now: u256) -> str:
        if market.state == RESOLVED:
            return "REFUND" if market.refund_all else "SETTLED"
        if now < market.opens_at:
            return "PREDICTION_OPEN"
        if now < market.settles_at:
            return "CANDLE_IN_PROGRESS"
        return "READY_TO_RESOLVE"

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _normalize_address(self, value: str) -> str:
        text = str(value).strip().lower()
        if (len(text) != 42 or text[:2] != "0x" or
                not all(char in "0123456789abcdef" for char in text[2:])):
            _err(EXPECTED, "invalid address")
        return text

    def _price(self, raw) -> int:
        text = str(raw).strip() if isinstance(raw, (str, int)) else ""
        if (not text or len(text) > 40 or text.startswith(("+", "-")) or
                "e" in text.lower() or text.count(".") > 1):
            return -1
        parts = text.split(".")
        whole = parts[0]
        fraction = parts[1] if len(parts) == 2 else ""
        if (not whole or not self._digits(whole) or
                (len(parts) == 2 and not fraction) or
                (fraction and not self._digits(fraction)) or len(fraction) > 8):
            return -1
        value = int(whole) * PRICE_SCALE
        if fraction:
            value += int((fraction + "0" * 8)[:8])
        return value if 0 < value <= 10**20 else -1

    def _whole(self, raw) -> int:
        text = str(raw).strip() if isinstance(raw, (str, int)) else ""
        return int(text) if text and self._digits(text) else -1

    def _day_start(self, epoch: u256) -> u256:
        return (epoch // DAY) * DAY

    def _date_text(self, epoch: u256) -> str:
        z = int(epoch // DAY) + 719468
        era = z // 146097
        doe = z - era * 146097
        yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
        year = yoe + era * 400
        doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
        month_part = (5 * doy + 2) // 153
        day = doy - (153 * month_part + 2) // 5 + 1
        month = month_part + (3 if month_part < 10 else -9)
        year += 1 if month <= 2 else 0
        return "%04d-%02d-%02d" % (year, month, day)

    def _now(self) -> u256:
        text = str(gl.message_raw["datetime"])
        suffix = text[19:] if len(text) >= 20 else ""
        valid_suffix = suffix in ("Z", "+00:00")
        if not valid_suffix and suffix.startswith("."):
            if suffix.endswith("Z"):
                fraction = suffix[1:-1]
            elif suffix.endswith("+00:00"):
                fraction = suffix[1:-6]
            else:
                fraction = ""
            valid_suffix = 0 < len(fraction) <= 9 and self._digits(fraction)
        if len(text) < 20 or text[10] != "T" or not valid_suffix:
            _err(EXPECTED, "invalid UTC transaction time")
        if (not self._digits(text[11:13]) or not self._digits(text[14:16]) or
                not self._digits(text[17:19])):
            _err(EXPECTED, "invalid UTC transaction time")
        try:
            date = self._date(text[:10])
            hour, minute, second = int(text[11:13]), int(text[14:16]), int(text[17:19])
        except Exception:
            _err(EXPECTED, "invalid UTC transaction time")
        if (text[13] != ":" or text[16] != ":" or hour > 23 or
                minute > 59 or second > 59):
            _err(EXPECTED, "invalid UTC transaction time")
        return date + hour * 3600 + minute * 60 + second

    def _date(self, value: str) -> u256:
        text = str(value)
        if (len(text) != 10 or text[4] != "-" or text[7] != "-" or
                not self._digits(text[:4]) or not self._digits(text[5:7]) or
                not self._digits(text[8:10])):
            _err(EXPECTED, "date must be YYYY-MM-DD")
        year, month, day = int(text[:4]), int(text[5:7]), int(text[8:10])
        if (year < 1970 or year > 9999 or month < 1 or month > 12 or
                day < 1 or day > self._month_days(year, month)):
            _err(EXPECTED, "invalid market date")
        before = (367 * month - 362) // 12
        if month > 2:
            before -= 1 if self._leap(year) else 2
        ordinal = (365 * (year - 1) + (year - 1) // 4 - (year - 1) // 100 +
                   (year - 1) // 400 + before + day)
        return u256((ordinal - 719163) * DAY)

    def _digits(self, value: str) -> bool:
        return len(value) > 0 and all(char in "0123456789" for char in value)

    def _leap(self, year: int) -> bool:
        return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

    def _month_days(self, year: int, month: int) -> int:
        if month == 2:
            return 29 if self._leap(year) else 28
        return 30 if month in (4, 6, 9, 11) else 31

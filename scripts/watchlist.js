// watchlist.js — the scan universe (RULES.md §2).
//
// US-listed only (NYSE, NASDAQ). Sectors: Technology, Fintech, AI infrastructure.
// EXCLUDED by rule: energy, defense, biotech.
// Liquidity (avg daily volume > 1M shares) is enforced at scan time by hard
// filter #3, not curated here — but this list is already large-cap / liquid.
//
// Editable by hand. The refresh script tolerates bad/dead tickers: any ticker
// that fails to fetch shows up in data.json `errors[]` rather than crashing the
// scan, so pruning is low-risk.

const WATCHLIST = [
  // --- Semiconductors / AI infrastructure ---
  'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'MU', 'INTC', 'QCOM', 'TXN', 'AMAT',
  'LRCX', 'KLAC', 'MRVL', 'ADI', 'ARM', 'SMCI', 'ANET', 'MPWR', 'ON', 'NXPI',

  // --- Mega-cap tech / platform software ---
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU',
  'SAP', 'IBM', 'ACN', 'ADSK', 'WDAY', 'TEAM', 'SNPS', 'CDNS',

  // --- Security / cloud / data infrastructure ---
  'PANW', 'CRWD', 'ZS', 'FTNT', 'NET', 'DDOG', 'SNOW', 'MDB', 'PLTR', 'OKTA',
  'TWLO', 'ESTC', 'HUBS', 'S',

  // --- Internet / consumer tech ---
  'UBER', 'ABNB', 'SHOP', 'SPOT', 'DASH', 'RBLX', 'ROKU', 'TTD', 'MELI', 'SE',

  // --- Fintech / payments ---
  'V', 'MA', 'PYPL', 'XYZ', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'FI', 'GPN',
  'NU', 'FICO',
];

// Human-readable names. yfinance supplies the authoritative name at fetch time;
// this map is a fallback (and powers demo mode, which never hits the network).
const NAMES = {
  NVDA: 'NVIDIA Corp.', AMD: 'Advanced Micro Devices', AVGO: 'Broadcom Inc.',
  TSM: 'Taiwan Semiconductor', ASML: 'ASML Holding', MU: 'Micron Technology',
  INTC: 'Intel Corp.', QCOM: 'Qualcomm Inc.', TXN: 'Texas Instruments',
  AMAT: 'Applied Materials', LRCX: 'Lam Research', KLAC: 'KLA Corp.',
  MRVL: 'Marvell Technology', ADI: 'Analog Devices', ARM: 'Arm Holdings',
  SMCI: 'Super Micro Computer', ANET: 'Arista Networks', MPWR: 'Monolithic Power',
  ON: 'ON Semiconductor', NXPI: 'NXP Semiconductors',
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.', META: 'Meta Platforms', ORCL: 'Oracle Corp.',
  CRM: 'Salesforce Inc.', ADBE: 'Adobe Inc.', NOW: 'ServiceNow Inc.',
  INTU: 'Intuit Inc.', SAP: 'SAP SE', IBM: 'IBM Corp.', ACN: 'Accenture plc',
  ADSK: 'Autodesk Inc.', WDAY: 'Workday Inc.', TEAM: 'Atlassian Corp.',
  SNPS: 'Synopsys Inc.', CDNS: 'Cadence Design Systems',
  PANW: 'Palo Alto Networks', CRWD: 'CrowdStrike Holdings', ZS: 'Zscaler Inc.',
  FTNT: 'Fortinet Inc.', NET: 'Cloudflare Inc.', DDOG: 'Datadog Inc.',
  SNOW: 'Snowflake Inc.', MDB: 'MongoDB Inc.', PLTR: 'Palantir Technologies',
  OKTA: 'Okta Inc.', TWLO: 'Twilio Inc.', ESTC: 'Elastic N.V.',
  HUBS: 'HubSpot Inc.', S: 'SentinelOne Inc.',
  UBER: 'Uber Technologies', ABNB: 'Airbnb Inc.', SHOP: 'Shopify Inc.',
  SPOT: 'Spotify Technology', DASH: 'DoorDash Inc.', RBLX: 'Roblox Corp.',
  ROKU: 'Roku Inc.', TTD: 'The Trade Desk', MELI: 'MercadoLibre Inc.',
  SE: 'Sea Limited',
  V: 'Visa Inc.', MA: 'Mastercard Inc.', PYPL: 'PayPal Holdings',
  XYZ: 'Block Inc.', COIN: 'Coinbase Global', HOOD: 'Robinhood Markets',
  SOFI: 'SoFi Technologies', AFRM: 'Affirm Holdings', FI: 'Fiserv Inc.',
  GPN: 'Global Payments', NU: 'Nu Holdings', FICO: 'Fair Isaac Corp.',
};

module.exports = { WATCHLIST, NAMES };

// ============================================================
// SweetReturns — Stock Data Generator
// Generates 500 stocks with candy theming & Golden Ticket scores
// ============================================================

import type { StockData, SectorInfo, DirectionBias, GraphEdge } from '../types';

// --- Deterministic seeded random ---
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStr(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// --- Sector Definitions ---
export const SECTORS: SectorInfo[] = [
  { name: 'Technology', icon: '[TC]', district: 'Pixel Candy Arcade', color: '#00BFFF', position: [0, 0] },
  { name: 'Healthcare', icon: '[HC]', district: 'Medicine Drop Lane', color: '#00FF7F', position: [1, 0] },
  { name: 'Financials', icon: '[FN]', district: 'Chocolate Coin Plaza', color: '#FFD700', position: [2, 0] },
  { name: 'Consumer Discretionary', icon: '[CD]', district: 'Candy Bar Boulevard', color: '#FF69B4', position: [0, 1] },
  { name: 'Communication Services', icon: '[CS]', district: 'Bubblegum Row', color: '#9370DB', position: [1, 1] },
  { name: 'Industrials', icon: '[IN]', district: 'Gumball Factory', color: '#808080', position: [2, 1] },
  { name: 'Consumer Staples', icon: '[ST]', district: 'Sugar & Spice Market', color: '#FF6347', position: [0, 2] },
  { name: 'Energy', icon: '[EN]', district: 'Rock Candy Refinery', color: '#FF8C00', position: [1, 2] },
  { name: 'Utilities', icon: '[UT]', district: 'Licorice Lane', color: '#8B0000', position: [2, 2] },
  { name: 'Real Estate', icon: '[RE]', district: 'Gingerbread Heights', color: '#DEB887', position: [0, 3] },
  { name: 'Materials', icon: '[MT]', district: 'Caramel Quarry', color: '#DAA520', position: [1, 3] },
];

export const SECTOR_CANDY_ICONS: Record<string, string[]> = {
  'Technology': ['candy_bar', 'ring_candy', 'pixel_cube'],
  'Healthcare': ['jelly_bean', 'capsule_candy', 'gummy_drop'],
  'Financials': ['chocolate_coin', 'gold_square', 'hard_candy'],
  'Consumer Discretionary': ['candy_heart', 'lollipop', 'wrapped_candy'],
  'Communication Services': ['bubblegum_sphere', 'ring_candy', 'candy_ribbon'],
  'Industrials': ['jawbreaker', 'candy_bolt', 'candy_bar'],
  'Consumer Staples': ['wrapped_mint', 'candy_cane', 'candy_box'],
  'Energy': ['rock_candy', 'candy_crystal', 'candy_gem'],
  'Utilities': ['candy_cane', 'hard_candy', 'mint_tin'],
  'Real Estate': ['candy_house', 'mint_tin', 'candy_block'],
  'Materials': ['rock_candy', 'candy_gem', 'candy_crystal'],
};

// --- Tier Colors ---
export const TIER_COLORS: Record<number, string> = {
  0: '#F5F5DC', // Vanilla White
  1: '#7FFF00', // Sour Green
  2: '#00BFFF', // Electric Blue
  3: '#FFD700', // Fortune Gold
  4: '#FF69B4', // Taffy Pink
  5: '#FF4500', // Gummy Red
};

export const PLATINUM_COLOR = '#DAA520';

// --- Company Data (real tickers grouped by sector) ---
const COMPANIES: Record<string, Array<[string, string, string]>> = {
  'Technology': [
    ['AAPL', 'Apple Inc.', '#A2AAAD'], ['MSFT', 'Microsoft Corp.', '#F25022'],
    ['NVDA', 'NVIDIA Corp.', '#76B900'], ['AVGO', 'Broadcom Inc.', '#CC0000'],
    ['ORCL', 'Oracle Corp.', '#FF0000'], ['CRM', 'Salesforce Inc.', '#00A1E0'],
    ['ADBE', 'Adobe Inc.', '#FF0000'], ['AMD', 'AMD Inc.', '#ED1C24'],
    ['CSCO', 'Cisco Systems', '#049FD9'], ['INTC', 'Intel Corp.', '#0071C5'],
    ['QCOM', 'Qualcomm Inc.', '#3253DC'], ['TXN', 'Texas Instruments', '#CC0000'],
    ['INTU', 'Intuit Inc.', '#365EBF'], ['AMAT', 'Applied Materials', '#F47920'],
    ['NOW', 'ServiceNow', '#81B5A1'], ['MU', 'Micron Technology', '#00589F'],
    ['SNPS', 'Synopsys Inc.', '#A020F0'], ['CDNS', 'Cadence Design', '#FFA500'],
    ['LRCX', 'Lam Research', '#0066B2'], ['KLAC', 'KLA Corp.', '#8B008B'],
    ['PANW', 'Palo Alto Networks', '#FA582D'], ['MRVL', 'Marvell Tech', '#8B0000'],
    ['FTNT', 'Fortinet Inc.', '#EE3124'], ['ADSK', 'Autodesk Inc.', '#0696D7'],
    ['MSI', 'Motorola Solutions', '#003DA5'], ['IT', 'Gartner Inc.', '#005EB8'],
    ['APH', 'Amphenol Corp.', '#005DAA'], ['ROP', 'Roper Technologies', '#002244'],
    ['NXPI', 'NXP Semiconductors', '#FFCC00'], ['TEL', 'TE Connectivity', '#F7941D'],
    ['CRWD', 'CrowdStrike', '#FF2400'], ['ANSS', 'ANSYS Inc.', '#FFD700'],
    ['TEAM', 'Atlassian', '#0052CC'], ['DDOG', 'Datadog Inc.', '#632CA6'],
    ['WDAY', 'Workday Inc.', '#0073CF'], ['ZS', 'Zscaler Inc.', '#0090FF'],
    ['HUBS', 'HubSpot Inc.', '#FF7A59'], ['NET', 'Cloudflare', '#F48120'],
    ['SNOW', 'Snowflake Inc.', '#29B5E8'], ['MDB', 'MongoDB Inc.', '#00ED64'],
    ['PLTR', 'Palantir Tech.', '#101820'], ['DELL', 'Dell Technologies', '#007DB8'],
    ['HPE', 'Hewlett Packard', '#01A982'], ['KEYS', 'Keysight Tech.', '#6F2C91'],
    ['CDW', 'CDW Corp.', '#CC0000'], ['GEN', 'Gen Digital', '#FDB813'],
    ['SMCI', 'Super Micro Computer', '#009639'], ['MPWR', 'Monolithic Power', '#005DAA'],
    ['ON', 'ON Semiconductor', '#1B365D'], ['ENPH', 'Enphase Energy', '#F7941D'],
  ],
  'Healthcare': [
    ['UNH', 'UnitedHealth Group', '#002677'], ['JNJ', 'Johnson & Johnson', '#D51F26'],
    ['LLY', 'Eli Lilly', '#D52B1E'], ['PFE', 'Pfizer Inc.', '#0093D0'],
    ['ABBV', 'AbbVie Inc.', '#071D49'], ['MRK', 'Merck & Co.', '#009A44'],
    ['TMO', 'Thermo Fisher', '#E31937'], ['ABT', 'Abbott Labs', '#009CDE'],
    ['DHR', 'Danaher Corp.', '#0067A5'], ['AMGN', 'Amgen Inc.', '#0063BE'],
    ['BMY', 'Bristol-Myers', '#BE1E2D'], ['ISRG', 'Intuitive Surgical', '#004C97'],
    ['GILD', 'Gilead Sciences', '#003366'], ['VRTX', 'Vertex Pharma', '#F26522'],
    ['MDT', 'Medtronic', '#004B87'], ['SYK', 'Stryker Corp.', '#006747'],
    ['REGN', 'Regeneron', '#0072CE'], ['BSX', 'Boston Scientific', '#003768'],
    ['CI', 'Cigna Group', '#E47025'], ['ELV', 'Elevance Health', '#6F2C91'],
    ['HCA', 'HCA Healthcare', '#005B96'], ['ZTS', 'Zoetis Inc.', '#00A3E0'],
    ['BDX', 'Becton Dickinson', '#005DAA'], ['EW', 'Edwards Lifesci.', '#8C1515'],
    ['IQV', 'IQVIA Holdings', '#00A4E4'], ['MCK', 'McKesson Corp.', '#009FDA'],
    ['CVS', 'CVS Health', '#CC0000'], ['IDXX', 'IDEXX Labs', '#0075C9'],
    ['A', 'Agilent Tech.', '#FF6900'], ['BIIB', 'Biogen Inc.', '#00857C'],
    ['RMD', 'ResMed Inc.', '#0072CE'], ['CAH', 'Cardinal Health', '#CC0000'],
    ['BAX', 'Baxter Intl.', '#006298'], ['MRNA', 'Moderna Inc.', '#00A1DF'],
    ['ALGN', 'Align Technology', '#F7941D'], ['DXCM', 'DexCom Inc.', '#00B2A9'],
    ['HOLX', 'Hologic Inc.', '#00558C'], ['MTD', 'Mettler-Toledo', '#003366'],
    ['WAT', 'Waters Corp.', '#0072CE'], ['WST', 'West Pharma.', '#005A9C'],
    ['PODD', 'Insulet Corp.', '#00B389'], ['TECH', 'Bio-Techne', '#003DA5'],
    ['ILMN', 'Illumina Inc.', '#58B947'], ['CRL', 'Charles River', '#0066B2'],
  ],
  'Financials': [
    ['JPM', 'JPMorgan Chase', '#003B6F'], ['V', 'Visa Inc.', '#1A1F71'],
    ['MA', 'Mastercard', '#FF5F00'], ['BAC', 'Bank of America', '#012169'],
    ['WFC', 'Wells Fargo', '#D71E28'], ['GS', 'Goldman Sachs', '#6F9FD8'],
    ['MS', 'Morgan Stanley', '#002C5F'], ['BLK', 'BlackRock', '#000000'],
    ['SPGI', 'S&P Global', '#CC0000'], ['AXP', 'American Express', '#016FD0'],
    ['C', 'Citigroup', '#003B70'], ['SCHW', 'Charles Schwab', '#00A0DF'],
    ['CB', 'Chubb Ltd.', '#D4001A'], ['MMC', 'Marsh McLennan', '#003DA5'],
    ['PGR', 'Progressive', '#0047BB'], ['ICE', 'Intercontinental', '#0072CE'],
    ['AON', 'Aon plc', '#E4002B'], ['CME', 'CME Group', '#002B5C'],
    ['MCO', 'Moody\'s Corp.', '#003366'], ['USB', 'U.S. Bancorp', '#002663'],
    ['BK', 'BNY Mellon', '#002A5C'], ['PNC', 'PNC Financial', '#FF6600'],
    ['TFC', 'Truist Financial', '#330072'], ['AFL', 'Aflac Inc.', '#00447C'],
    ['AIG', 'AIG Inc.', '#003DA5'], ['TRV', 'Travelers', '#E81828'],
    ['MET', 'MetLife Inc.', '#00834D'], ['PRU', 'Prudential', '#003DA5'],
    ['ALL', 'Allstate', '#003DA5'], ['FITB', 'Fifth Third', '#003B4C'],
    ['MTB', 'M&T Bank', '#003DA5'], ['COF', 'Capital One', '#004977'],
    ['STT', 'State Street', '#003DA5'], ['HBAN', 'Huntington', '#00B140'],
    ['DFS', 'Discover Financial', '#FF6000'], ['KEY', 'KeyCorp', '#006747'],
    ['CFG', 'Citizens Financial', '#009CDE'], ['RF', 'Regions Financial', '#009A44'],
    ['CINF', 'Cincinnati Fin.', '#003366'], ['FRC', 'First Republic', '#003B5C'],
    ['SIVB', 'SVB Financial', '#003366'], ['ZION', 'Zions Bancorp', '#003DA5'],
    ['NTRS', 'Northern Trust', '#002244'], ['BRO', 'Brown & Brown', '#00447C'],
  ],
  'Consumer Discretionary': [
    ['AMZN', 'Amazon.com', '#FF9900'], ['TSLA', 'Tesla Inc.', '#CC0000'],
    ['HD', 'Home Depot', '#F96302'], ['MCD', 'McDonald\'s', '#FFC72C'],
    ['NKE', 'Nike Inc.', '#111111'], ['LOW', 'Lowe\'s', '#004990'],
    ['SBUX', 'Starbucks', '#006241'], ['TJX', 'TJX Companies', '#FF0000'],
    ['BKNG', 'Booking Holdings', '#003580'], ['CMG', 'Chipotle', '#A81612'],
    ['ABNB', 'Airbnb Inc.', '#FF5A5F'], ['ORLY', 'O\'Reilly Auto', '#009639'],
    ['MAR', 'Marriott', '#B22234'], ['GM', 'General Motors', '#0170CE'],
    ['F', 'Ford Motor', '#003399'], ['ROST', 'Ross Stores', '#003DA5'],
    ['DHI', 'D.R. Horton', '#003E51'], ['HLT', 'Hilton Worldwide', '#104C97'],
    ['AZO', 'AutoZone', '#D52B1E'], ['YUM', 'Yum! Brands', '#E4002B'],
    ['LEN', 'Lennar Corp.', '#003DA5'], ['DKNG', 'DraftKings', '#61B03E'],
    ['ULTA', 'Ulta Beauty', '#E4572E'], ['DPZ', 'Domino\'s Pizza', '#006491'],
    ['EBAY', 'eBay Inc.', '#E53238'], ['RCL', 'Royal Caribbean', '#001E4D'],
    ['CCL', 'Carnival Corp.', '#003DA5'], ['ETSY', 'Etsy Inc.', '#F1641E'],
    ['CPRT', 'Copart Inc.', '#003DA5'], ['GPC', 'Genuine Parts', '#002244'],
    ['LVS', 'Las Vegas Sands', '#C5A572'], ['WYNN', 'Wynn Resorts', '#76232F'],
    ['MGM', 'MGM Resorts', '#BC9B6A'], ['BBY', 'Best Buy', '#0046BE'],
    ['POOL', 'Pool Corp.', '#003DA5'], ['DRI', 'Darden Restaurants', '#CC0000'],
    ['APTV', 'Aptiv plc', '#005DAA'], ['BWA', 'BorgWarner', '#003366'],
    ['GRMN', 'Garmin Ltd.', '#000000'], ['TSCO', 'Tractor Supply', '#007A33'],
    ['PHM', 'PulteGroup', '#003B71'], ['NVR', 'NVR Inc.', '#003366'],
    ['TPR', 'Tapestry Inc.', '#1C1C1C'], ['EXPE', 'Expedia Group', '#003B95'],
  ],
  'Communication Services': [
    ['GOOGL', 'Alphabet Inc.', '#4285F4'], ['META', 'Meta Platforms', '#0668E1'],
    ['NFLX', 'Netflix Inc.', '#E50914'], ['DIS', 'Walt Disney', '#003DA5'],
    ['CMCSA', 'Comcast Corp.', '#000000'], ['VZ', 'Verizon', '#CD040B'],
    ['T', 'AT&T Inc.', '#009FDB'], ['TMUS', 'T-Mobile US', '#E20074'],
    ['CHTR', 'Charter Comm.', '#0077C8'], ['EA', 'Electronic Arts', '#FF4747'],
    ['ATVI', 'Activision', '#00AEFF'], ['TTWO', 'Take-Two', '#CC0000'],
    ['WBD', 'Warner Bros.', '#003DA5'], ['MTCH', 'Match Group', '#FE3C72'],
    ['RBLX', 'Roblox Corp.', '#E2231A'], ['SNAP', 'Snap Inc.', '#FFFC00'],
    ['PINS', 'Pinterest', '#E60023'], ['LYV', 'Live Nation', '#003DA5'],
    ['PARA', 'Paramount', '#0064FF'], ['FOX', 'Fox Corp.', '#003366'],
    ['NWSA', 'News Corp.', '#003366'], ['OMC', 'Omnicom Group', '#00447C'],
    ['IPG', 'Interpublic', '#000000'], ['ZM', 'Zoom Video', '#2D8CFF'],
    ['SPOT', 'Spotify', '#1DB954'], ['ROKU', 'Roku Inc.', '#6C3FC5'],
    ['TWLO', 'Twilio Inc.', '#F22F46'], ['DASH', 'DoorDash', '#FF3008'],
    ['U', 'Unity Software', '#000000'], ['DDOG', 'Datadog', '#632CA6'],
  ],
  'Industrials': [
    ['GE', 'General Electric', '#3B73B9'], ['CAT', 'Caterpillar', '#FFCD11'],
    ['HON', 'Honeywell', '#D52B1E'], ['UNP', 'Union Pacific', '#003DA5'],
    ['RTX', 'RTX Corp.', '#003DA5'], ['BA', 'Boeing Co.', '#003DA5'],
    ['UPS', 'United Parcel', '#351C15'], ['DE', 'Deere & Co.', '#367C2B'],
    ['LMT', 'Lockheed Martin', '#003DA5'], ['ADP', 'ADP Inc.', '#D52B1E'],
    ['MMM', 'Minnesota Mining', '#CC0000'], ['GD', 'General Dynamics', '#003DA5'],
    ['ITW', 'Illinois Tool', '#C41230'], ['EMR', 'Emerson Electric', '#003DA5'],
    ['WM', 'Waste Management', '#007A33'], ['NOC', 'Northrop Grumman', '#003366'],
    ['FDX', 'FedEx Corp.', '#4D148C'], ['CSX', 'CSX Corp.', '#00447C'],
    ['NSC', 'Norfolk Southern', '#000000'], ['CTAS', 'Cintas Corp.', '#002244'],
    ['ETN', 'Eaton Corp.', '#005DAA'], ['PCAR', 'PACCAR Inc.', '#003366'],
    ['FAST', 'Fastenal Co.', '#003DA5'], ['JCI', 'Johnson Controls', '#009A44'],
    ['CARR', 'Carrier Global', '#003DA5'], ['OTIS', 'Otis Worldwide', '#003DA5'],
    ['GWW', 'W.W. Grainger', '#CC0000'], ['ROK', 'Rockwell Auto.', '#CC0000'],
    ['VRSK', 'Verisk Analytics', '#003366'], ['IR', 'Ingersoll Rand', '#007A33'],
    ['PAYX', 'Paychex Inc.', '#0066B2'], ['PWR', 'Quanta Services', '#FF6600'],
    ['XYL', 'Xylem Inc.', '#003DA5'], ['TT', 'Trane Technologies', '#003DA5'],
    ['AME', 'AMETEK Inc.', '#003366'], ['WAB', 'Westinghouse Air', '#003DA5'],
    ['SWK', 'Stanley B&D', '#FFD100'], ['IEX', 'IDEX Corp.', '#003DA5'],
    ['DOV', 'Dover Corp.', '#003366'], ['PH', 'Parker-Hannifin', '#003366'],
    ['CMI', 'Cummins Inc.', '#CC0000'], ['RSG', 'Republic Services', '#004B87'],
    ['DAL', 'Delta Air Lines', '#003366'], ['LUV', 'Southwest Airlines', '#304CB2'],
  ],
  'Consumer Staples': [
    ['PG', 'Procter & Gamble', '#003DA5'], ['KO', 'Coca-Cola', '#F40009'],
    ['PEP', 'PepsiCo Inc.', '#004B93'], ['COST', 'Costco', '#E31837'],
    ['WMT', 'Walmart', '#0071CE'], ['PM', 'Philip Morris', '#6C2585'],
    ['MO', 'Altria Group', '#008000'], ['MDLZ', 'Mondelez', '#4F2170'],
    ['CL', 'Colgate-Palmolive', '#E31937'], ['EL', 'Estee Lauder', '#042B5E'],
    ['KMB', 'Kimberly-Clark', '#003DA5'], ['GIS', 'General Mills', '#003DA5'],
    ['ADM', 'Archer-Daniels', '#003DA5'], ['KHC', 'Kraft Heinz', '#003DA5'],
    ['SYY', 'Sysco Corp.', '#003DA5'], ['HSY', 'Hershey Co.', '#5B3427'],
    ['STZ', 'Constellation', '#003DA5'], ['K', 'Kellanova', '#CC0000'],
    ['CHD', 'Church & Dwight', '#003DA5'], ['MKC', 'McCormick & Co.', '#D52B1E'],
    ['TSN', 'Tyson Foods', '#003DA5'], ['HRL', 'Hormel Foods', '#A6192E'],
    ['SJM', 'J.M. Smucker', '#003366'], ['CPB', 'Campbell Soup', '#D52B1E'],
    ['CAG', 'Conagra Brands', '#D52B1E'], ['CLX', 'Clorox Co.', '#003DA5'],
    ['TAP', 'Molson Coors', '#003366'], ['BG', 'Bunge Ltd.', '#009639'],
    ['MNST', 'Monster Beverage', '#95D600'], ['KDP', 'Keurig Dr Pepper', '#003DA5'],
  ],
  'Energy': [
    ['XOM', 'Exxon Mobil', '#D52B1E'], ['CVX', 'Chevron Corp.', '#003DA5'],
    ['COP', 'ConocoPhillips', '#CC0000'], ['EOG', 'EOG Resources', '#C0392B'],
    ['SLB', 'Schlumberger', '#003DA5'], ['MPC', 'Marathon Petroleum', '#003366'],
    ['PSX', 'Phillips 66', '#003DA5'], ['VLO', 'Valero Energy', '#003DA5'],
    ['OXY', 'Occidental Petro.', '#CC0000'], ['PXD', 'Pioneer Natural', '#003DA5'],
    ['WMB', 'Williams Cos.', '#003DA5'], ['HAL', 'Halliburton', '#CC0000'],
    ['DVN', 'Devon Energy', '#003DA5'], ['FANG', 'Diamondback', '#003366'],
    ['BKR', 'Baker Hughes', '#003366'], ['OKE', 'ONEOK Inc.', '#003DA5'],
    ['KMI', 'Kinder Morgan', '#003DA5'], ['TRGP', 'Targa Resources', '#003366'],
    ['HES', 'Hess Corp.', '#009639'], ['APA', 'APA Corp.', '#003DA5'],
    ['MRO', 'Marathon Oil', '#003DA5'], ['CTRA', 'Coterra Energy', '#003366'],
    ['EQT', 'EQT Corp.', '#003DA5'], ['RRC', 'Range Resources', '#003DA5'],
  ],
  'Utilities': [
    ['NEE', 'NextEra Energy', '#003DA5'], ['SO', 'Southern Co.', '#003DA5'],
    ['DUK', 'Duke Energy', '#003DA5'], ['D', 'Dominion Energy', '#003DA5'],
    ['SRE', 'Sempra', '#003DA5'], ['AEP', 'American Electric', '#003DA5'],
    ['EXC', 'Exelon Corp.', '#003DA5'], ['XEL', 'Xcel Energy', '#003DA5'],
    ['ED', 'Consolidated Edison', '#003DA5'], ['EIX', 'Edison Intl.', '#003DA5'],
    ['WEC', 'WEC Energy', '#003DA5'], ['ES', 'Eversource', '#003DA5'],
    ['AWK', 'American Water', '#003DA5'], ['PEG', 'PSEG Inc.', '#003DA5'],
    ['DTE', 'DTE Energy', '#003DA5'], ['FE', 'FirstEnergy', '#003DA5'],
    ['PPL', 'PPL Corp.', '#003DA5'], ['CMS', 'CMS Energy', '#003DA5'],
    ['ATO', 'Atmos Energy', '#003DA5'], ['CNP', 'CenterPoint', '#003DA5'],
    ['NI', 'NiSource Inc.', '#003DA5'], ['EVRG', 'Evergy Inc.', '#003DA5'],
    ['LNT', 'Alliant Energy', '#003DA5'], ['AES', 'AES Corp.', '#003DA5'],
  ],
  'Real Estate': [
    ['PLD', 'Prologis Inc.', '#003DA5'], ['AMT', 'American Tower', '#003DA5'],
    ['CCI', 'Crown Castle', '#003DA5'], ['EQIX', 'Equinix Inc.', '#E60028'],
    ['PSA', 'Public Storage', '#F26522'], ['O', 'Realty Income', '#003DA5'],
    ['SPG', 'Simon Property', '#003DA5'], ['WELL', 'Welltower Inc.', '#003DA5'],
    ['DLR', 'Digital Realty', '#003DA5'], ['VICI', 'VICI Properties', '#BC9B6A'],
    ['AVB', 'AvalonBay', '#003DA5'], ['EQR', 'Equity Residential', '#003DA5'],
    ['ARE', 'Alexandria RE', '#003DA5'], ['MAA', 'Mid-America Apt.', '#003DA5'],
    ['UDR', 'UDR Inc.', '#003DA5'], ['ESS', 'Essex Property', '#003DA5'],
    ['VTR', 'Ventas Inc.', '#003DA5'], ['PEAK', 'Healthpeak', '#003DA5'],
    ['HST', 'Host Hotels', '#003DA5'], ['KIM', 'Kimco Realty', '#003DA5'],
    ['REG', 'Regency Centers', '#003DA5'], ['BXP', 'BXP Inc.', '#003DA5'],
    ['CPT', 'Camden Property', '#003DA5'], ['IRM', 'Iron Mountain', '#009639'],
  ],
  'Materials': [
    ['LIN', 'Linde plc', '#003DA5'], ['APD', 'Air Products', '#003DA5'],
    ['SHW', 'Sherwin-Williams', '#003DA5'], ['FCX', 'Freeport-McMoRan', '#003DA5'],
    ['NEM', 'Newmont Corp.', '#003DA5'], ['ECL', 'Ecolab Inc.', '#003DA5'],
    ['DOW', 'Dow Inc.', '#E31937'], ['NUE', 'Nucor Corp.', '#003DA5'],
    ['DD', 'DuPont', '#003DA5'], ['VMC', 'Vulcan Materials', '#003DA5'],
    ['MLM', 'Martin Marietta', '#003DA5'], ['PPG', 'PPG Industries', '#003DA5'],
    ['CTVA', 'Corteva Inc.', '#003DA5'], ['BALL', 'Ball Corp.', '#003DA5'],
    ['ALB', 'Albemarle Corp.', '#003DA5'], ['CF', 'CF Industries', '#003DA5'],
    ['MOS', 'Mosaic Co.', '#003DA5'], ['AVY', 'Avery Dennison', '#CC0000'],
    ['EMN', 'Eastman Chemical', '#003DA5'], ['CE', 'Celanese Corp.', '#003DA5'],
    ['IFF', 'IFF Inc.', '#003DA5'], ['IP', 'International Paper', '#003DA5'],
    ['PKG', 'Packaging Corp.', '#003DA5'], ['WRK', 'WestRock', '#003DA5'],
  ],
};

function assignCandyIcon(ticker: string, sector: string): string {
  const pool = SECTOR_CANDY_ICONS[sector] || ['hard_candy'];
  return pool[hashStr(ticker) % pool.length];
}

function computeDirectionBias(goldenScore: number, rand: () => number): DirectionBias {
  const bullish = goldenScore / 5;
  const buy = 0.15 + bullish * 0.35 + (rand() - 0.5) * 0.1;
  const call = 0.10 + bullish * 0.25 + (rand() - 0.5) * 0.08;
  const put = 0.35 - bullish * 0.25 + (rand() - 0.5) * 0.08;
  const short_val = 0.40 - bullish * 0.35 + (rand() - 0.5) * 0.1;
  const total = buy + call + put + short_val;
  return {
    buy: Math.max(0.05, buy / total),
    call: Math.max(0.05, call / total),
    put: Math.max(0.05, put / total),
    short: Math.max(0.05, short_val / total),
  };
}

// --- Poisson Disk Sampling for random store placement ---
function poissonDiskSample(
  count: number,
  width: number,
  height: number,
  minDist: number,
  rand: () => number,
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid: (number | null)[] = new Array(gridW * gridH).fill(null);

  const offsetX = -width / 2;
  const offsetZ = -height / 2;

  function gridIdx(x: number, z: number): number {
    const gx = Math.floor((x - offsetX) / cellSize);
    const gz = Math.floor((z - offsetZ) / cellSize);
    return gz * gridW + gx;
  }

  function isValid(x: number, z: number): boolean {
    if (x < offsetX || x >= offsetX + width || z < offsetZ || z >= offsetZ + height) return false;
    const gx = Math.floor((x - offsetX) / cellSize);
    const gz = Math.floor((z - offsetZ) / cellSize);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nx >= gridW || nz < 0 || nz >= gridH) continue;
        const idx = nz * gridW + nx;
        if (grid[idx] !== null) {
          const p = points[grid[idx]!];
          const ddx = p.x - x;
          const ddz = p.z - z;
          if (ddx * ddx + ddz * ddz < minDist * minDist) return false;
        }
      }
    }
    return true;
  }

  // Seed first point
  const firstX = offsetX + rand() * width;
  const firstZ = offsetZ + rand() * height;
  points.push({ x: firstX, z: firstZ });
  grid[gridIdx(firstX, firstZ)] = 0;
  const active = [0];

  while (active.length > 0 && points.length < count) {
    const aIdx = Math.floor(rand() * active.length);
    const parent = points[active[aIdx]];
    let found = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = rand() * Math.PI * 2;
      const dist = minDist + rand() * minDist;
      const nx = parent.x + Math.cos(angle) * dist;
      const nz = parent.z + Math.sin(angle) * dist;

      if (isValid(nx, nz)) {
        const idx = points.length;
        points.push({ x: nx, z: nz });
        grid[gridIdx(nx, nz)] = idx;
        active.push(idx);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(aIdx, 1);
    }
  }

  // If we don't have enough points, fill with random valid positions
  let fallbackAttempts = 0;
  while (points.length < count && fallbackAttempts < count * 10) {
    const x = offsetX + rand() * width;
    const z = offsetZ + rand() * height;
    if (isValid(x, z)) {
      grid[gridIdx(x, z)] = points.length;
      points.push({ x, z });
    }
    fallbackAttempts++;
  }

  return points.slice(0, count);
}

export function generateStockData(): StockData[] {
  const rand = seededRandom(42);
  const stocks: StockData[] = [];

  // Collect all companies flat
  const allCompanies: Array<{ ticker: string; company: string; brandColor: string; sector: string }> = [];
  for (const sector of SECTORS) {
    const companies = COMPANIES[sector.name] || [];
    for (const [ticker, company, brandColor] of companies) {
      allCompanies.push({ ticker, company, brandColor, sector: sector.name });
    }
  }

  // Generate random positions using Poisson disk sampling
  const positions = poissonDiskSample(allCompanies.length, 1800, 1800, 22.0, rand);

  for (let globalRank = 0; globalRank < allCompanies.length; globalRank++) {
    const { ticker, company, brandColor, sector } = allCompanies[globalRank];

    // Golden score: weighted toward 0-2, rare 3+
    const rawScore = rand();
    let goldenScore: number;
    if (rawScore < 0.40) goldenScore = 0;
    else if (rawScore < 0.65) goldenScore = 1;
    else if (rawScore < 0.82) goldenScore = 2;
    else if (rawScore < 0.92) goldenScore = 3;
    else if (rawScore < 0.97) goldenScore = 4;
    else goldenScore = 5;

    const isPlatinum = goldenScore >= 4 && rand() < 0.3;
    const mcapPercentile = 1 - ((globalRank + 1) / allCompanies.length);

    const pos = positions[globalRank] || { x: rand() * 200 - 100, z: rand() * 200 - 100 };

    stocks.push({
      ticker,
      company,
      sector,
      market_cap_rank: globalRank + 1,
      golden_score: goldenScore,
      ticket_levels: {
        dip_ticket: goldenScore >= 1,
        shock_ticket: goldenScore >= 2,
        asymmetry_ticket: goldenScore >= 3,
        dislocation_ticket: goldenScore >= 4,
        convexity_ticket: goldenScore >= 5,
      },
      is_platinum: isPlatinum,
      rarity_percentile: 0.5 + rand() * 0.5,
      direction_bias: computeDirectionBias(goldenScore, rand),
      forward_return_distribution: {
        p5: -0.15 + rand() * 0.1,
        p25: -0.05 + rand() * 0.05,
        median: -0.02 + rand() * 0.08,
        p75: 0.03 + rand() * 0.1,
        p95: 0.10 + rand() * 0.25,
        skew: -0.5 + rand() * 2.0,
      },
      drawdown_current: -(rand() * 0.3),
      volume_percentile: 0.2 + rand() * 0.8,
      volatility_percentile: 0.1 + rand() * 0.9,
      brand_color: brandColor,
      candy_type: assignCandyIcon(ticker, sector),
      city_position: {
        x: pos.x,
        y: 0,
        z: pos.z,
      },
      store_dimensions: {
        width: 1.0 + mcapPercentile * 2.0,
        height: 1.5 + mcapPercentile * 2.5,
        depth: 1.0 + mcapPercentile * 1.0,
      },
    });
  }

  return stocks;
}

export function getCorrelationEdges(
  stocks: StockData[],
  threshold: number = 0.5,
): GraphEdge[] {
  const rand = seededRandom(123);
  const edges: GraphEdge[] = [];

  // Precompute normalized feature vectors for distance-based correlation
  const features = stocks.map((s) => ({
    gs: s.golden_score / 5,
    dd: (s.drawdown_current + 0.3) / 0.3,
    vol: s.volume_percentile,
    vola: s.volatility_percentile,
    fwdMed: (s.forward_return_distribution.median + 0.1) / 0.35,
    fwdSkew: (s.forward_return_distribution.skew + 0.5) / 2.5,
  }));

  for (let i = 0; i < stocks.length; i++) {
    for (let j = i + 1; j < stocks.length; j++) {
      const fi = features[i];
      const fj = features[j];

      // Euclidean distance across features (lower = more similar)
      const dist = Math.sqrt(
        (fi.gs - fj.gs) ** 2 +
        (fi.dd - fj.dd) ** 2 +
        (fi.vol - fj.vol) ** 2 +
        (fi.vola - fj.vola) ** 2 +
        (fi.fwdMed - fj.fwdMed) ** 2 +
        (fi.fwdSkew - fj.fwdSkew) ** 2,
      );

      // Convert distance to similarity (max dist ~= sqrt(6) ~= 2.45)
      const similarity = 1.0 - (dist / 2.45);

      // Same-sector bonus: small additive, not dominant
      const sectorBonus = stocks[i].sector === stocks[j].sector ? 0.1 : 0.0;

      // Small random noise for visual variety
      const noise = (rand() - 0.5) * 0.15;

      const corr = Math.max(-1, Math.min(1, similarity + sectorBonus + noise));

      if (Math.abs(corr) > threshold) {
        edges.push({
          source: stocks[i].ticker,
          target: stocks[j].ticker,
          weight: corr,
        });
      }

      if (edges.length > 3000) return edges;
    }
  }

  return edges;
}

// --- Company name lookup from COMPANIES data ---
const COMPANY_NAME_MAP: Record<string, string> = {};
for (const sectorName of Object.keys(COMPANIES)) {
  for (const [ticker, name] of COMPANIES[sectorName]) {
    COMPANY_NAME_MAP[ticker] = name;
  }
}

// --- Load real pipeline data from frontend_payload.json ---
interface PipelinePayload {
  stocks: Array<{
    ticker: string;
    company: string;
    sector: string;
    golden_score: number;
    is_platinum: boolean;
    price?: number;
    volatility?: number;
    ret_20d?: number;
    max_drawdown?: number;
    vol_spike?: number;
    skewness?: number;
    news_count?: number;
    // Full pipeline fields (optional)
    market_cap_rank?: number;
    ticket_levels?: StockData['ticket_levels'];
    rarity_percentile?: number;
    direction_bias?: StockData['direction_bias'];
    forward_return_distribution?: StockData['forward_return_distribution'];
    brand_color?: string;
    store_dimensions?: StockData['store_dimensions'];
    agent_density?: number;
    speed_multiplier?: number;
    technicals?: StockData['technicals'];
  }>;
  edges?: GraphEdge[];
  correlation_edges?: GraphEdge[];
}

export async function loadPipelineData(): Promise<{
  stocks: StockData[];
  edges: GraphEdge[];
}> {
  const res = await fetch('/frontend_payload.json');
  if (!res.ok) throw new Error(`Failed to load pipeline data: ${res.status}`);
  const payload: PipelinePayload = await res.json();

  const rand = seededRandom(42);
  const positions = poissonDiskSample(payload.stocks.length, 1800, 1800, 22.0, rand);

  const stocks: StockData[] = payload.stocks.map((raw, i) => {
    const pos = positions[i] || { x: rand() * 200 - 100, z: rand() * 200 - 100 };
    const companyName = COMPANY_NAME_MAP[raw.ticker] || raw.company;
    const gs = raw.golden_score ?? 0;
    const vol = raw.volatility ?? (0.01 + rand() * 0.04);
    const dd = raw.max_drawdown ?? (rand() * 0.3);
    const skew = raw.skewness ?? (rand() * 2 - 0.5);

    // Derive brand color from sector if not provided
    const brandColor = raw.brand_color
      || SECTORS.find(s => s.name === raw.sector)?.color
      || `hsl(${hashStr(raw.ticker) % 360}, 60%, 50%)`;

    return {
      ticker: raw.ticker,
      company: companyName,
      sector: raw.sector,
      market_cap_rank: raw.market_cap_rank ?? i + 1,
      golden_score: gs,
      ticket_levels: raw.ticket_levels ?? {
        dip_ticket: dd > 0.15,
        shock_ticket: dd > 0.10 && (raw.vol_spike ?? 1) > 2,
        asymmetry_ticket: skew > 0.5,
        dislocation_ticket: (raw.ret_20d ?? 0) < -0.10,
        convexity_ticket: gs >= 4,
      },
      is_platinum: raw.is_platinum ?? false,
      rarity_percentile: raw.rarity_percentile ?? (1 - (i / payload.stocks.length)),
      direction_bias: raw.direction_bias ?? {
        buy: 0.4 + rand() * 0.2,
        call: 0.15 + rand() * 0.1,
        put: 0.1 + rand() * 0.1,
        short: 0.05 + rand() * 0.1,
      },
      forward_return_distribution: raw.forward_return_distribution ?? {
        p5: -0.15 - rand() * 0.1,
        p25: -0.03 - rand() * 0.03,
        median: 0.005 + rand() * 0.01,
        p75: 0.04 + rand() * 0.03,
        p95: 0.15 + rand() * 0.1,
        skew: skew,
      },
      drawdown_current: dd,
      volume_percentile: raw.vol_spike ? Math.min(raw.vol_spike / 5, 1) : rand(),
      volatility_percentile: vol / 0.06,
      brand_color: brandColor,
      candy_type: assignCandyIcon(raw.ticker, raw.sector),
      city_position: { x: pos.x, y: 0, z: pos.z },
      store_dimensions: raw.store_dimensions ?? {
        width: 1.5 + gs * 0.3,
        height: 2.0 + gs * 0.6,
        depth: 1.5 + gs * 0.3,
      },
      agent_density: raw.agent_density,
      speed_multiplier: raw.speed_multiplier,
      technicals: raw.technicals,
    };
  });

  return {
    stocks,
    edges: payload.edges || payload.correlation_edges || [],
  };
}

// --- Time-based stock modulation ---
export function modulateStocksByTime(
  baseStocks: StockData[],
  currentDate: string,
  mode: 'historical' | 'present' | 'future',
): StockData[] {
  if (mode === 'present') return baseStocks;

  const today = new Date('2026-02-21').getTime();
  const dateTs = new Date(currentDate).getTime();
  const dayOffset = Math.round((dateTs - today) / 86_400_000);

  return baseStocks.map((stock) => {
    const seed = hashStr(stock.ticker) + Math.abs(dayOffset) * 7919;
    const rand = seededRandom(seed);

    if (mode === 'historical') {
      // Seeded random walk: modulate golden_score, direction_bias, drawdown
      const walkMag = Math.min(Math.abs(dayOffset) / 365, 1.0) * 0.3;
      const gsNoise = (rand() - 0.5) * walkMag * 2;
      const newGs = Math.max(0, Math.min(5, Math.round(stock.golden_score + gsNoise)));

      const ddShift = (rand() - 0.5) * walkMag * 0.15;
      const newDrawdown = Math.max(-0.5, Math.min(0, stock.drawdown_current + ddShift));

      const newBias = computeDirectionBias(newGs, rand);

      return {
        ...stock,
        golden_score: newGs,
        drawdown_current: newDrawdown,
        direction_bias: newBias,
        ticket_levels: {
          dip_ticket: newGs >= 1,
          shock_ticket: newGs >= 2,
          asymmetry_ticket: newGs >= 3,
          dislocation_ticket: newGs >= 4,
          convexity_ticket: newGs >= 5,
        },
      };
    }

    // mode === 'future': project using forward_return_distribution
    const fwd = stock.forward_return_distribution;
    const daysForward = Math.max(1, dayOffset);
    const progressFactor = Math.min(daysForward / 365, 1.0);

    // Project direction_bias based on forward returns
    const projectedBullish = 0.5 + fwd.median * progressFactor * 3;
    const bullClamp = Math.max(0.1, Math.min(0.9, projectedBullish));

    const buy = bullClamp * 0.55 + (rand() - 0.5) * 0.05;
    const call = bullClamp * 0.45 + (rand() - 0.5) * 0.05;
    const put = (1 - bullClamp) * 0.5 + (rand() - 0.5) * 0.05;
    const shortVal = (1 - bullClamp) * 0.5 + (rand() - 0.5) * 0.05;
    const total = buy + call + put + shortVal;
    const newBias: DirectionBias = {
      buy: Math.max(0.05, buy / total),
      call: Math.max(0.05, call / total),
      put: Math.max(0.05, put / total),
      short: Math.max(0.05, shortVal / total),
    };

    // Evolve golden_score based on skew and return magnitude
    const gsShift = fwd.skew * progressFactor * 0.5 + fwd.median * progressFactor * 2;
    const newGs = Math.max(0, Math.min(5, Math.round(stock.golden_score + gsShift)));

    // Project drawdown recovery/deepening
    const newDrawdown = Math.max(-0.5, Math.min(0, stock.drawdown_current + fwd.median * progressFactor));

    return {
      ...stock,
      golden_score: newGs,
      drawdown_current: newDrawdown,
      direction_bias: newBias,
      ticket_levels: {
        dip_ticket: newGs >= 1,
        shock_ticket: newGs >= 2,
        asymmetry_ticket: newGs >= 3,
        dislocation_ticket: newGs >= 4,
        convexity_ticket: newGs >= 5,
      },
    };
  });
}

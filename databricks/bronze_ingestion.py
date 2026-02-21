# Databricks notebook source
# MAGIC %md
# MAGIC # Bronze Layer: Raw Data Ingestion
# MAGIC Ingest stock_details_5_years.csv into Delta Lake bronze tables.

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import *

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Raw CSV
# MAGIC Upload stock_details_5_years.csv to DBFS first:
# MAGIC ```
# MAGIC dbfs:/FileStore/sweetreturns/stock_details_5_years.csv
# MAGIC ```

# COMMAND ----------

raw_schema = StructType([
    StructField("Date", DateType(), True),
    StructField("Open", DoubleType(), True),
    StructField("High", DoubleType(), True),
    StructField("Low", DoubleType(), True),
    StructField("Close", DoubleType(), True),
    StructField("Volume", LongType(), True),
    StructField("Dividends", DoubleType(), True),
    StructField("Stock Splits", DoubleType(), True),
    StructField("Company", StringType(), True),
])

raw_df = (spark.read
    .option("header", "true")
    .schema(raw_schema)
    .csv("dbfs:/FileStore/sweetreturns/stock_details_5_years.csv")
)

raw_df = raw_df.withColumnRenamed("Company", "ticker").withColumnRenamed("Stock Splits", "stock_splits")
print(f"Rows: {raw_df.count()}, Tickers: {raw_df.select('ticker').distinct().count()}")
raw_df.printSchema()

# COMMAND ----------

# MAGIC %md
# MAGIC ## GICS Sector Mapping

# COMMAND ----------

# Create sector mapping (abbreviated — full mapping has ~500 tickers across 11 sectors)
# Include the full SECTOR_MAP dictionary mapping sector names to lists of tickers
# (same as in the Colab notebooks)
SECTOR_MAP = {
    "Technology": ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO", "ORCL", "CRM", "AMD", "ADBE",
                   "ACN", "CSCO", "INTC", "TXN", "QCOM", "INTU", "AMAT", "NOW", "IBM", "MU",
                   "LRCX", "ADI", "SNPS", "CDNS", "KLAC", "MRVL", "FTNT", "PANW", "CRWD", "MSI",
                   "NXPI", "APH", "TEL", "ROP", "KEYS", "ANSS", "CDW", "ZBRA", "EPAM", "PAYC",
                   "GOOG", "PLTR", "NET", "DDOG"],
    "Healthcare": ["UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY",
                   "AMGN", "MDT", "ELV", "ISRG", "GILD", "CI", "SYK", "CVS", "REGN", "VRTX",
                   "BSX", "ZTS", "BDX", "HUM", "MCK", "HCA", "IDXX", "IQV", "EW", "DXCM",
                   "MTD", "A", "BIIB", "ALGN", "HOLX", "BAX", "TECH", "HSIC", "VTRS", "OGN"],
    "Financials": ["BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SPGI",
                   "AXP", "C", "SCHW", "CB", "MMC", "PGR", "ICE", "CME", "AON", "USB",
                   "MCO", "PNC", "AIG", "MET", "TFC", "AMP", "AFL", "TRV", "ALL", "PRU",
                   "BK", "COF", "FIS", "MSCI", "FI", "RJF", "WRB", "HBAN", "NTRS", "STT"],
    "Consumer Discretionary": ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "CMG",
                                "MAR", "ORLY", "AZO", "ROST", "DHI", "YUM", "DG", "LEN", "EBAY", "GPC",
                                "ULTA", "APTV", "BBY", "GRMN", "POOL", "MGM", "DRI", "HAS", "WHR", "NVR",
                                "TSCO", "KMX", "WYNN", "CZR", "LVS", "RCL", "CCL", "NCLH", "HLT", "EXPE"],
    "Communication Services": ["GOOG", "META", "DIS", "CMCSA", "NFLX", "VZ", "T", "TMUS", "CHTR", "ATVI",
                                "EA", "WBD", "PARA", "FOX", "FOXA", "OMC", "IPG", "TTWO", "MTCH", "LYV",
                                "RBLX", "ZM", "PINS", "SNAP", "ROKU"],
    "Industrials": ["GE", "CAT", "HON", "UNP", "RTX", "BA", "UPS", "DE", "LMT", "ADP",
                    "MMM", "GD", "NOC", "ITW", "EMR", "WM", "ETN", "PH", "CTAS", "FAST",
                    "CSX", "NSC", "TT", "CARR", "OTIS", "RSG", "VRSK", "CPRT", "ODFL", "URI",
                    "DAL", "LUV", "UAL", "AAL", "FDX", "CHRW", "JBHT", "XYL", "AME", "ROK"],
    "Consumer Staples": ["PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "MDLZ", "CL", "EL",
                          "KMB", "GIS", "SYY", "KHC", "HSY", "MKC", "K", "CPB", "SJM", "HRL",
                          "CAG", "TSN", "ADM", "BG", "TAP", "STZ", "BF.B", "CLX", "CHD", "WBA"],
    "Energy": ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PXD", "PSX", "VLO", "OXY",
               "WMB", "HES", "DVN", "HAL", "BKR", "FANG", "TRGP", "KMI", "OKE", "CTRA",
               "MRO", "APA", "DEN", "EQT", "AR"],
    "Utilities": ["NEE", "DUK", "SO", "AEP", "D", "SRE", "EXC", "XEL", "ED", "WEC",
                   "ES", "AWK", "DTE", "PPL", "FE", "AEE", "CMS", "CNP", "ATO", "EVRG",
                   "NI", "PNW", "NRG", "LNT", "OGE"],
    "Real Estate": ["PLD", "AMT", "CCI", "EQIX", "PSA", "SPG", "O", "DLR", "WELL", "AVB",
                     "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "HST", "KIM", "REG", "PEAK",
                     "CPT", "SUI", "BXP", "INVH", "CUBE"],
    "Materials": ["LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "VMC", "MLM", "DOW",
                   "DD", "PPG", "CE", "EMN", "IP", "PKG", "AVY", "ALB", "CF", "MOS",
                   "FMC", "IFF", "CTVA", "SEE", "RPM"],
}

# Build broadcast mapping
ticker_sector = []
for sector, tickers in SECTOR_MAP.items():
    for t in tickers:
        ticker_sector.append((t, sector))

sector_df = spark.createDataFrame(ticker_sector, ["ticker", "sector"])
raw_df = raw_df.join(sector_df, on="ticker", how="left")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Delta Lake Bronze

# COMMAND ----------

(raw_df.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("sweetreturns.bronze.raw_stock_data")
)

print(f"Bronze table written: sweetreturns.bronze.raw_stock_data")
spark.sql("SELECT COUNT(*), COUNT(DISTINCT ticker) FROM sweetreturns.bronze.raw_stock_data").show()

# COMMAND ----------

# Data quality checks
spark.sql("""
    SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT ticker) as unique_tickers,
        MIN(Date) as start_date,
        MAX(Date) as end_date,
        SUM(CASE WHEN Close IS NULL THEN 1 ELSE 0 END) as null_closes,
        SUM(CASE WHEN sector IS NULL THEN 1 ELSE 0 END) as unmapped_sectors
    FROM sweetreturns.bronze.raw_stock_data
""").show()

# Databricks notebook source
# MAGIC %md
# MAGIC # Schema Setup
# MAGIC Creates the sweetreturns catalog and bronze/silver/gold/ml_models schemas.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE CATALOG IF NOT EXISTS sweetreturns;
# MAGIC USE CATALOG sweetreturns;
# MAGIC CREATE SCHEMA IF NOT EXISTS bronze;
# MAGIC CREATE SCHEMA IF NOT EXISTS silver;
# MAGIC CREATE SCHEMA IF NOT EXISTS gold;
# MAGIC CREATE SCHEMA IF NOT EXISTS ml_models;

# COMMAND ----------

print("Schema setup complete!")

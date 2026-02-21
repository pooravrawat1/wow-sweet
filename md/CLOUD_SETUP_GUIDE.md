# Cloud Provider Setup Guide — Wolf of Wall Sweet

Complete step-by-step instructions for setting up Databricks, cloud storage, and deployment infrastructure for your hackathon project.

---

## Table of Contents

1. [Quick Start (Choose Your Path)](#quick-start)
2. [Option 1: Databricks on AWS](#option-1-databricks-on-aws)
3. [Option 2: Databricks on Azure](#option-2-databricks-on-azure)
4. [Option 3: Databricks Community Edition (Free)](#option-3-databricks-community-edition)
5. [Backend Deployment](#backend-deployment)
6. [Frontend Deployment (Vercel)](#frontend-deployment)
7. [Environment Variables & Secrets](#environment-variables)
8. [Cost Optimization](#cost-optimization)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Which Option Should You Choose?

| Option | Cost | Setup Time | Features | Best For |
|--------|------|------------|----------|----------|
| **AWS** | ~$80/hackathon | 30 min | Full features, Model Serving, Auto-scaling | Teams with AWS credits |
| **Azure** | ~$85/hackathon | 30 min | Full features, tight Azure integration | Teams with Azure for Students |
| **Community Edition** | FREE | 10 min | Limited compute, no Model Serving | Prototyping, tight budgets |

**Recommendation:** Start with Community Edition for first 16 hours, then migrate to AWS/Azure for final push.

---

## Option 1: Databricks on AWS

### Prerequisites

- AWS account (free tier or student account)
- AWS CLI installed
- Basic familiarity with AWS Console

### Step 1: Create AWS Account & Get Credits

1. **Sign up for AWS:**
   - Visit: https://aws.amazon.com/free/
   - Create account (requires credit card)

2. **Apply for AWS Educate (Students):**
   - Visit: https://aws.amazon.com/education/awseducate/
   - Get $100-300 in credits
   - Approval takes 1-2 days, apply early!

3. **Alternative: GitHub Student Pack:**
   - Visit: https://education.github.com/pack
   - Includes $200 AWS credits via Activate

### Step 2: Install AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# Download from: https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Configure AWS CLI:**
```bash
aws configure
# AWS Access Key ID: [Your Key]
# AWS Secret Access Key: [Your Secret]
# Default region name: us-east-1
# Default output format: json
```

### Step 3: Create S3 Bucket for Data

```bash
# Create bucket
aws s3 mb s3://sweetreturns-data-$(date +%s)

# Store bucket name for later
export BUCKET_NAME=sweetreturns-data-$(date +%s)
echo $BUCKET_NAME > bucket_name.txt

# Upload datasets
cd /path/to/hacklytics25/datasets
aws s3 cp stock_details_5_years.csv s3://$BUCKET_NAME/bronze/stock_details_5_years.csv
aws s3 cp 30_yr_market_data.csv s3://$BUCKET_NAME/bronze/30_yr_market_data.csv
aws s3 cp 30_yr_financial_events.csv s3://$BUCKET_NAME/bronze/30_yr_financial_events.csv

# Verify upload
aws s3 ls s3://$BUCKET_NAME/bronze/
```

### Step 4: Create IAM Role for Databricks

**Create policy file:**
```bash
cat > databricks-s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::${BUCKET_NAME}/*",
        "arn:aws:s3:::${BUCKET_NAME}"
      ]
    }
  ]
}
EOF
```

**Create IAM role:**
```bash
# Create the policy
aws iam create-policy \
  --policy-name DatabricksS3Access \
  --policy-document file://databricks-s3-policy.json

# Create role trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::414351767826:role/unity-catalog-prod-UCMasterRole-14S5ZJVKOTYTL"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "YOUR_DATABRICKS_ACCOUNT_ID"
        }
      }
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name databricks-s3-access-role \
  --assume-role-policy-document file://trust-policy.json

# Attach policy to role
aws iam attach-role-policy \
  --role-name databricks-s3-access-role \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/DatabricksS3Access
```

### Step 5: Create Databricks Workspace

1. **Go to Databricks:**
   - Visit: https://accounts.cloud.databricks.com/registration.html
   - Sign up with email (use school email for potential student discount)

2. **Create Workspace:**
   - Click "Create Workspace"
   - Cloud: **AWS**
   - Region: **us-east-1** (cheapest)
   - Workspace Name: `sweetreturns`
   - Pricing Tier: **Premium** (14-day trial, then ~$0.55/DBU)

3. **Wait for Provisioning:**
   - Takes 5-10 minutes
   - You'll receive email when ready

### Step 6: Configure Databricks Workspace

1. **Create Compute Cluster:**
   - Go to: Compute → Create Cluster
   - Name: `sweetreturns-ml-cluster`
   - Cluster Mode: **Standard**
   - Databricks Runtime: **14.3 LTS ML** (includes scikit-learn, transformers)
   - Node Type:
     - Driver: `m5.xlarge` (4 cores, 16 GB RAM)
     - Workers: `m5.xlarge` × 2
   - Enable Autoscaling: ✅ (2-4 workers)
   - Auto Termination: **20 minutes**
   - Click **Create Cluster**

2. **Install Libraries:**
   - Go to cluster → Libraries → Install New
   - **PyPI:**
     ```
     transformers==4.36.0
     sentence-transformers==2.2.2
     bertopic==0.16.0
     yfinance==0.2.32
     fredapi==0.5.1
     praw==7.7.1
     networkx==3.2
     torch-geometric==2.4.0
     hmmlearn==0.3.0
     ```
   - Click **Install** (takes 5 minutes)

3. **Create Unity Catalog External Location:**
   - Go to: Data → External Locations → Create
   - Name: `sweetreturns_bronze`
   - URL: `s3://YOUR_BUCKET_NAME/bronze/`
   - Credential: Select your IAM role
   - Click **Create**

### Step 7: Create Database Schema

Create notebook: `00_setup_schema.py`

```python
# Databricks notebook source
# MAGIC %sql
# MAGIC CREATE CATALOG IF NOT EXISTS sweetreturns;
# MAGIC USE CATALOG sweetreturns;
# MAGIC CREATE SCHEMA IF NOT EXISTS bronze;
# MAGIC CREATE SCHEMA IF NOT EXISTS silver;
# MAGIC CREATE SCHEMA IF NOT EXISTS gold;
# MAGIC CREATE SCHEMA IF NOT EXISTS ml_models;

# COMMAND ----------
print("✅ Schema setup complete!")
```

Run the notebook.

### Step 8: Test Data Access

```python
# Test reading from S3
df = spark.read.format("csv")\
  .option("header", "true")\
  .option("inferSchema", "true")\
  .load("s3://YOUR_BUCKET_NAME/bronze/stock_details_5_years.csv")

display(df.limit(10))
```

---

## Option 2: Databricks on Azure

### Prerequisites

- Azure account (free $200 credit)
- Azure CLI installed

### Step 1: Create Azure Account

1. **Sign up:**
   - Visit: https://azure.microsoft.com/free/students/
   - Get $100 credit (no credit card required)

2. **Install Azure CLI:**
   ```bash
   # macOS
   brew install azure-cli

   # Linux
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

   # Windows
   # Download from: https://aka.ms/installazurecliwindows
   ```

3. **Login:**
   ```bash
   az login
   ```

### Step 2: Create Resource Group

```bash
az group create \
  --name sweetreturns-rg \
  --location eastus
```

### Step 3: Create Storage Account

```bash
# Create storage account
az storage account create \
  --name sweetreturnsdata$(date +%s) \
  --resource-group sweetreturns-rg \
  --location eastus \
  --sku Standard_LRS

# Store account name
export STORAGE_ACCOUNT=$(az storage account list -g sweetreturns-rg --query "[0].name" -o tsv)

# Create container
az storage container create \
  --name bronze \
  --account-name $STORAGE_ACCOUNT \
  --auth-mode login

# Upload data
cd /path/to/hacklytics25/datasets
az storage blob upload-batch \
  --destination bronze \
  --source . \
  --account-name $STORAGE_ACCOUNT \
  --auth-mode login
```

### Step 4: Create Databricks Workspace

1. **Via Azure Portal:**
   - Go to: https://portal.azure.com
   - Search: "Azure Databricks"
   - Click: Create
   - Resource Group: `sweetreturns-rg`
   - Workspace Name: `sweetreturns`
   - Region: **East US**
   - Pricing Tier: **Premium** (14-day trial)
   - Click: **Review + Create**

2. **Via CLI:**
   ```bash
   az databricks workspace create \
     --resource-group sweetreturns-rg \
     --name sweetreturns \
     --location eastus \
     --sku premium
   ```

### Step 5: Configure Storage Access

1. **Get Storage Account Key:**
   ```bash
   az storage account keys list \
     --resource-group sweetreturns-rg \
     --account-name $STORAGE_ACCOUNT \
     --query "[0].value" -o tsv
   ```

2. **In Databricks, create secret scope:**
   ```python
   # In Databricks notebook
   dbutils.secrets.createScope(scope="storage")
   dbutils.secrets.put(scope="storage", key="account-key", value="YOUR_STORAGE_KEY")
   ```

3. **Mount storage:**
   ```python
   configs = {
     f"fs.azure.account.key.{storage_account_name}.blob.core.windows.net": dbutils.secrets.get(scope="storage", key="account-key")
   }

   dbutils.fs.mount(
     source=f"wasbs://bronze@{storage_account_name}.blob.core.windows.net",
     mount_point="/mnt/bronze",
     extra_configs=configs
   )
   ```

### Step 6: Create Cluster (Same as AWS)

Follow **Option 1, Step 6** instructions.

---

## Option 3: Databricks Community Edition (Free)

### Perfect for: First 16 hours of hackathon

**Limitations:**
- Single-node cluster (no workers)
- 15 GB RAM max
- No Model Serving
- No Unity Catalog
- Notebooks deleted after 6 months of inactivity

### Setup Steps

1. **Sign Up:**
   - Visit: https://community.cloud.databricks.com/login.html
   - Click "Sign Up"
   - Use school email

2. **Create Cluster:**
   - Go to: Compute → Create Cluster
   - Name: `quickstart`
   - Runtime: **14.3 LTS ML**
   - Node Type: (auto-selected, ~15 GB RAM)
   - Click **Create**

3. **Upload Data:**
   - Go to: Data → Upload File
   - Upload `stock_details_5_years.csv`
   - Databricks will store it in DBFS

4. **Create Notebook:**
   ```python
   # Read uploaded file
   df = spark.read.format("csv")\
     .option("header", "true")\
     .option("inferSchema", "true")\
     .load("/FileStore/tables/stock_details_5_years.csv")

   display(df.limit(10))

   # Save as Delta table
   df.write.format("delta").mode("overwrite").saveAsTable("stock_data")
   ```

5. **Install Libraries:**
   - Cluster → Libraries → Install New
   - Install same PyPI packages as Option 1

**Migration Strategy:**
- Develop all notebooks in Community Edition
- Export notebooks as `.py` files
- When ready for final 8 hours, import to paid workspace

---

## Backend Deployment

### Option A: Local (Development)

```bash
cd wow-street/backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables
export DATABRICKS_WORKSPACE_URL="https://YOUR_WORKSPACE.cloud.databricks.com"
export DATABRICKS_TOKEN="YOUR_TOKEN"

# Run server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Test:**
```bash
curl http://localhost:8000/health
```

### Option B: AWS ECS (Production)

1. **Create Dockerfile:**
   ```dockerfile
   # backend/Dockerfile
   FROM python:3.11-slim

   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY app ./app
   EXPOSE 8000

   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

2. **Build and push to ECR:**
   ```bash
   # Create ECR repository
   aws ecr create-repository --repository-name sweetreturns-api

   # Login to ECR
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin \
     YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

   # Build image
   docker build -t sweetreturns-api .

   # Tag image
   docker tag sweetreturns-api:latest \
     YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sweetreturns-api:latest

   # Push image
   docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sweetreturns-api:latest
   ```

3. **Create ECS task definition:**
   ```json
   {
     "family": "sweetreturns-api",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "512",
     "memory": "1024",
     "containerDefinitions": [
       {
         "name": "api",
         "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sweetreturns-api:latest",
         "portMappings": [
           {
             "containerPort": 8000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "DATABRICKS_WORKSPACE_URL",
             "value": "https://YOUR_WORKSPACE.cloud.databricks.com"
           }
         ],
         "secrets": [
           {
             "name": "DATABRICKS_TOKEN",
             "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:databricks-token"
           }
         ]
       }
     ]
   }
   ```

4. **Deploy using AWS Copilot (easier):**
   ```bash
   # Install Copilot
   brew install aws/tap/copilot-cli

   # Initialize app
   cd backend
   copilot init --app sweetreturns --name api --type "Load Balanced Web Service"

   # Follow prompts, then deploy
   copilot deploy
   ```

### Option C: Railway (Fastest)

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Deploy:**
   ```bash
   cd backend
   railway init
   railway up
   ```

3. **Set environment variables:**
   ```bash
   railway variables set DATABRICKS_WORKSPACE_URL="https://YOUR_WORKSPACE.cloud.databricks.com"
   railway variables set DATABRICKS_TOKEN="YOUR_TOKEN"
   ```

---

## Frontend Deployment

### Vercel (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Configure environment:**
   ```bash
   # Create .env.production
   cat > .env.production <<EOF
   VITE_API_URL=https://your-backend-url.com
   VITE_WS_URL=wss://your-backend-url.com/ws/agent-stream
   EOF
   ```

3. **Deploy:**
   ```bash
   cd wow-street
   vercel --prod
   ```

4. **Set environment variables in Vercel dashboard:**
   - Go to: https://vercel.com/dashboard
   - Select project
   - Settings → Environment Variables
   - Add: `VITE_API_URL`, `VITE_WS_URL`

### Netlify (Alternative)

```bash
cd wow-street
npm run build

# Deploy
npx netlify-cli deploy --prod --dir=dist
```

---

## Environment Variables & Secrets

### Required Variables

**Backend:**
```bash
DATABRICKS_WORKSPACE_URL=https://YOUR_WORKSPACE.cloud.databricks.com
DATABRICKS_TOKEN=YOUR_TOKEN
DATABRICKS_SQL_WAREHOUSE_ID=YOUR_WAREHOUSE_ID
FRED_API_KEY=YOUR_FRED_KEY  # Get from: https://fred.stlouisfed.org/docs/api/api_key.html
REDDIT_CLIENT_ID=YOUR_ID
REDDIT_CLIENT_SECRET=YOUR_SECRET
GEMINI_API_KEY=YOUR_KEY  # Get from: https://makersuite.google.com/app/apikey
```

**Frontend:**
```bash
VITE_API_URL=https://your-backend.com
VITE_WS_URL=wss://your-backend.com/ws/agent-stream
```

### How to Get Databricks Token

1. Go to Databricks workspace
2. Click user icon (top right) → Settings
3. Developer → Access Tokens
4. Click "Generate New Token"
5. Comment: `sweetreturns-backend`
6. Lifetime: 90 days
7. Click **Generate**
8. Copy token immediately (won't be shown again)

### Secure Storage

**AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name databricks-token \
  --secret-string "YOUR_TOKEN"
```

**Azure Key Vault:**
```bash
az keyvault secret set \
  --vault-name sweetreturns-vault \
  --name databricks-token \
  --value "YOUR_TOKEN"
```

---

## Cost Optimization

### Databricks

1. **Use Spot Instances (AWS):**
   - Cluster → Edit → Advanced Options
   - Enable "Spot instances"
   - Save 60-80% on compute

2. **Auto-terminate:**
   - Set to 10-20 minutes
   - Cluster stops when idle

3. **Right-size cluster:**
   - Start with 1 worker
   - Scale up only if needed

4. **Use Community Edition first:**
   - Develop for 16 hours (free)
   - Migrate for final 8 hours

### AWS/Azure

1. **Delete resources after hackathon:**
   ```bash
   # AWS
   aws s3 rb s3://YOUR_BUCKET --force
   aws ecs delete-service --cluster default --service sweetreturns-api --force
   aws ecr delete-repository --repository-name sweetreturns-api --force

   # Azure
   az group delete --name sweetreturns-rg --yes
   ```

2. **Use free tiers:**
   - S3: First 5 GB free
   - ECS Fargate: 20 GB-hours free/month
   - Azure Storage: First 5 GB free

### Estimated Total Cost (24 hours)

| Item | Hours | Cost |
|------|-------|------|
| Databricks Cluster (2 workers) | 14 | $45 |
| S3/Azure Storage | 24 | $2 |
| ECS Fargate / Azure Container | 24 | $12 |
| Data Transfer | - | $5 |
| **Total** | | **$64** |

**With optimizations:** ~$30-40

---

## Troubleshooting

### Issue: Databricks cluster won't start

**Symptoms:**
- Cluster stuck in "Pending" state
- Error: "Cannot launch cluster"

**Solutions:**
1. Check AWS service limits: `aws service-quotas list-service-quotas --service-code ec2`
2. Try different region (us-west-2)
3. Reduce cluster size to 1 worker
4. Use smaller instance type (m5.large)

### Issue: Can't access S3 from Databricks

**Symptoms:**
- Error: "Access Denied" when reading from S3

**Solutions:**
1. Verify IAM role attached to cluster
2. Check bucket policy allows Databricks role
3. Try using access keys instead:
   ```python
   spark.conf.set("fs.s3a.access.key", "YOUR_KEY")
   spark.conf.set("fs.s3a.secret.key", "YOUR_SECRET")
   ```

### Issue: FastAPI WebSocket connection refused

**Symptoms:**
- Frontend can't connect to `ws://localhost:8000`
- Error: "WebSocket connection failed"

**Solutions:**
1. Check backend is running: `curl http://localhost:8000/health`
2. Check CORS settings in `main.py`
3. Try `ws://127.0.0.1:8000` instead
4. Disable firewall temporarily

### Issue: Out of memory on Databricks

**Symptoms:**
- Notebook crashes with OOM error
- Spark job fails with "Container killed by YARN"

**Solutions:**
1. Increase cluster size (add workers)
2. Reduce data batch size
3. Use `repartition()` to split data:
   ```python
   df = df.repartition(20)
   ```
4. Cache intermediate results:
   ```python
   df.cache()
   ```

### Issue: FinBERT inference too slow

**Symptoms:**
- Sentiment analysis takes >10 seconds per row

**Solutions:**
1. Use batching:
   ```python
   @pandas_udf(DoubleType())
   def batch_sentiment(texts: pd.Series) -> pd.Series:
       # Process 32 texts at once
       ...
   ```
2. Use GPU cluster (expensive)
3. Pre-compute sentiments, cache results

### Issue: Vercel build fails

**Symptoms:**
- Error: "Build exceeded maximum duration"

**Solutions:**
1. Reduce bundle size:
   ```bash
   npm run build -- --sourcemap=false
   ```
2. Increase Vercel timeout (Pro plan)
3. Build locally, deploy pre-built:
   ```bash
   npm run build
   vercel --prebuilt
   ```

---

## Quick Reference Commands

### Databricks

```python
# List tables
spark.sql("SHOW TABLES IN sweetreturns.gold").show()

# Read Delta table
df = spark.table("sweetreturns.gold.golden_tickets")

# Time travel (read table at specific timestamp)
df_old = spark.read.format("delta").option("timestampAsOf", "2024-01-01").table("...")

# Optimize table
spark.sql("OPTIMIZE sweetreturns.gold.golden_tickets")
```

### AWS CLI

```bash
# List S3 buckets
aws s3 ls

# Copy file to S3
aws s3 cp myfile.csv s3://my-bucket/

# Check ECS service status
aws ecs describe-services --cluster default --services sweetreturns-api

# View CloudWatch logs
aws logs tail /ecs/sweetreturns-api --follow
```

### Azure CLI

```bash
# List resource groups
az group list

# Check Databricks workspace status
az databricks workspace show --resource-group sweetreturns-rg --name sweetreturns

# List storage containers
az storage container list --account-name sweetreturnsdata
```

### Docker

```bash
# Build image
docker build -t sweetreturns-api .

# Run locally
docker run -p 8000:8000 -e DATABRICKS_TOKEN=xxx sweetreturns-api

# View logs
docker logs CONTAINER_ID

# Stop all containers
docker stop $(docker ps -aq)
```

---

## Next Steps

1. **Choose your cloud path** (AWS, Azure, or Community Edition)
2. **Follow setup steps** for your chosen path
3. **Test data access** with a simple notebook
4. **Deploy backend** (start local, deploy when ready)
5. **Deploy frontend** to Vercel
6. **Test end-to-end** with WebSocket connection

**Good luck! 🚀**

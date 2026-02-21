# Wolf of Wall Sweet — Quick Start Checklist

**USE THIS AS YOUR MASTER CHECKLIST DURING THE HACKATHON**

Print this out or keep it open in a separate window. Check off items as you complete them.

---

## Pre-Hackathon Preparation (1 Week Before)

### Cloud Accounts Setup

- [ ] Create Databricks account (Community Edition or paid)
- [ ] Apply for AWS Educate / Azure for Students ($100-300 credits)
- [ ] Install AWS CLI or Azure CLI
- [ ] Configure cloud CLI with credentials
- [ ] Get API keys:
  - [ ] FRED API (<https://fred.stlouisfed.org/docs/api/api_key.html>)
  - [ ] Reddit API (<https://www.reddit.com/prefs/apps>)
  - [ ] Gemini API (<https://makersuite.google.com/app/apikey>)

### Team Coordination

- [ ] Assign roles (Data Engineer, ML Engineer, Backend Dev, Frontend Dev)
- [ ] Set up GitHub repository for code sharing
- [ ] Schedule team meeting for Day 0 (review architecture)
- [ ] Test video call setup for remote collaboration

### Development Environment

- [ ] Install Python 3.11+
- [ ] Install Node.js 18+
- [ ] Install Docker Desktop (for backend deployment)
- [ ] Clone hacklytics25 repo to all team machines
- [ ] Test: `cd wow-street && npm install && npm run dev`
- [ ] Test: `cd backend && pip install -r requirements.txt && uvicorn app.main:app`

### Data Preparation

- [ ] Upload `stock_details_5_years.csv` to cloud storage (S3 / Azure Blob / DBFS)
- [ ] Test: Read CSV in Databricks notebook
- [ ] (Optional) Download additional news datasets

---

## Hackathon Day — Hour-by-Hour Checklist

### Hours 0-2: Infrastructure Setup ⚙️

**Goal:** Cloud infrastructure running, data accessible

- [ ] **Person 1 (Data Engineer):**
  - [ ] Spin up Databricks cluster
  - [ ] Create Unity Catalog schemas (bronze/silver/gold)
  - [ ] Upload datasets to cloud storage
  - [ ] Test: Read CSV from Databricks

- [ ] **Person 2 (ML Engineer):**
  - [ ] Install ML libraries on Databricks cluster
  - [ ] Download FinBERT model (test inference locally)
  - [ ] Set up Jupyter notebook for prototyping

- [ ] **Person 3 (Backend Dev):**
  - [ ] Create `backend/` directory structure
  - [ ] Set up FastAPI boilerplate
  - [ ] Test: `uvicorn app.main:app --reload`
  - [ ] Verify health endpoint: `curl localhost:8000/health`

- [ ] **Person 4 (Frontend Dev):**
  - [ ] Review current frontend codebase
  - [ ] Identify where to integrate WebSocket client
  - [ ] Create branch: `feature/websocket-integration`

**Milestone:** ✅ Everyone can access Databricks, backend runs locally, frontend builds

---

### Hours 2-6: Data Pipeline Enhancement 📊

**Goal:** Multi-source data ingested into Delta Lake

- [ ] **Person 1 (Data Engineer):**
  - [ ] Run `bronze_ingestion.py` (stock data → Delta)
  - [ ] Fetch GDELT news OR use Kaggle financial news dataset
  - [ ] Run `bronze_news_ingestion.py`
  - [ ] (Optional) Fetch Reddit WSB data
  - [ ] Fetch FRED macroeconomic data
  - [ ] Verify: `SELECT * FROM sweetreturns.bronze.news_articles LIMIT 10`

- [ ] **Person 2 (ML Engineer):**
  - [ ] Run `silver_features.py` (compute technical indicators)
  - [ ] Test FinBERT locally on 10 sample headlines
  - [ ] Benchmark: How long for 1000 headlines?

**Milestone:** ✅ Bronze + Silver layers populated with multi-source data

---

### Hours 6-10: ML Models Training 🤖

**Goal:** FinBERT, GNN, HMM models trained and saved

- [ ] **Person 2 (ML Engineer):**
  - [ ] Run `ml_finbert_sentiment.py` (apply FinBERT to all news)
  - [ ] Run `ml_correlation_graph.py` (build stock correlation network)
  - [ ] Run `ml_regime_detection.py` (train HMM on SPY data)
  - [ ] (Optional) Run `ml_news_topics.py` (BERTopic clustering)
  - [ ] Save outputs:
    - [ ] `sweetreturns.gold.news_sentiment`
    - [ ] `/dbfs/FileStore/sweetreturns/correlation_graph.gpickle`
    - [ ] `sweetreturns.gold.market_regimes`

- [ ] **Person 1 (Data Engineer):**
  - [ ] Create `gold_agent_archetypes.py` (generate 100 archetypes)
  - [ ] Implement `compute_archetype_decision()` function
  - [ ] Test: Run for 1 date, verify decisions look reasonable

**Milestone:** ✅ All ML models trained, gold layer has archetypes + sentiment + regimes

---

### Hours 10-14: Pre-compute Historical Scenarios 💾

**Goal:** 3 scenarios (COVID, GME, AI Boom) pre-computed and saved

- [ ] **Person 1 (Data Engineer):**
  - [ ] Run `gold_precompute_scenarios.py`
  - [ ] Scenarios:
    - [ ] COVID Crash (Feb-Mar 2020)
    - [ ] GME Squeeze (Jan-Feb 2021)
    - [ ] AI Boom (Jan-Jun 2023)
  - [ ] Verify: `SELECT COUNT(*) FROM sweetreturns.gold.precomputed_agent_flows`
  - [ ] Export sample to JSON for frontend testing

- [ ] **Person 2 (ML Engineer):**
  - [ ] Deploy FinBERT to Model Serving (if using paid Databricks)
  - [ ] Test REST API: `curl -X POST ... -d '{"inputs": ["Tesla stock soars"]}'`

**Milestone:** ✅ Pre-computed agent flows saved to Delta, ready for playback

---

### Hours 14-18: Backend API Development 🔌

**Goal:** FastAPI backend connects to Databricks, streams agent flows via WebSocket

- [ ] **Person 3 (Backend Dev):**
  - [ ] Implement `databricks_client.py`
    - [ ] Function: `get_agent_flows(scenario, timestamp)`
    - [ ] Test: Query Delta table from Python
  - [ ] Implement WebSocket endpoint `/ws/agent-stream`
  - [ ] Test: Connect with Postman or wscat
  - [ ] Implement `/inject-news` endpoint
    - [ ] Calls FinBERT Model Serving
    - [ ] Extracts ticker mentions
    - [ ] Computes agent reactions
    - [ ] Broadcasts via WebSocket

- [ ] **Person 4 (Frontend Dev):**
  - [ ] Create `src/services/websocketClient.ts`
  - [ ] Test connection to backend: `ws://localhost:8000/ws/agent-stream`

**Milestone:** ✅ Backend API running, WebSocket connection established

---

### Hours 18-20: Frontend Integration 🎨

**Goal:** Frontend receives agent flows from backend and renders them

- [ ] **Person 4 (Frontend Dev):**
  - [ ] Modify `useCrowdSimulation.ts`:
    - [ ] Connect to WebSocket on mount
    - [ ] Store incoming flows in queue
    - [ ] Apply flows to agent targets
  - [ ] Add scenario selector dropdown
    - [ ] Options: COVID Crash, GME Squeeze, AI Boom
    - [ ] Sends selected scenario to backend
  - [ ] Test: Select scenario, verify agents move

- [ ] **Person 3 (Backend Dev):**
  - [ ] Deploy backend to cloud (Railway / ECS / Azure Container)
  - [ ] Update frontend `VITE_API_URL` to production URL

**Milestone:** ✅ End-to-end flow working (scenario selection → backend → frontend rendering)

---

### Hours 20-22: Live Hero Feature 🦸

**Goal:** "Inject Breaking News" feature working end-to-end

- [ ] **Person 4 (Frontend Dev):**
  - [ ] Create `NewsInjector.tsx` component
  - [ ] Add to main page (floating panel)
  - [ ] Test: Type "Tesla factory explodes" → Click Inject

- [ ] **Person 3 (Backend Dev):**
  - [ ] Verify `/inject-news` endpoint:
    - [ ] Calls FinBERT → sentiment
    - [ ] Extracts tickers
    - [ ] Computes agent reactions
    - [ ] Broadcasts to all WebSocket clients
  - [ ] Test: Inject news, watch frontend for agent reaction

- [ ] **Person 2 (ML Engineer):**
  - [ ] Help troubleshoot FinBERT inference if slow
  - [ ] Add caching for common ticker names

**Milestone:** ✅ Live news injection works, agents visibly react in real-time

---

### Hours 22-24: Polish & Demo Prep 🎬

**Goal:** Bug-free demo, presentation ready

- [ ] **Full Team:**
  - [ ] Fix any bugs found during testing
  - [ ] Add loading states / error handling
  - [ ] Improve visual polish:
    - [ ] Add glow effects for platinum stores
    - [ ] Smooth camera transitions
    - [ ] Color-code agents by action (BUY/SELL/etc.)
  - [ ] Deploy frontend to Vercel
  - [ ] Test production URL on mobile device

- [ ] **Presentation Prep:**
  - [ ] **Person 1:** Prepare Databricks notebook walkthrough
  - [ ] **Person 2:** Prepare ML model explanations (FinBERT, GNN, HMM)
  - [ ] **Person 3:** Prepare architecture diagram slide
  - [ ] **Person 4:** Prepare live demo script

- [ ] **Demo Rehearsal:**
  - [ ] Practice full demo (5 minutes)
  - [ ] Prepare backup video in case of connectivity issues
  - [ ] Test on judge's perspective (laptop + projector)

**Milestone:** ✅ Demo is flawless, team is confident

---

## Demo Day Checklist 🎤

### 30 Minutes Before Presentation

- [ ] Load production URL in browser
- [ ] Test WebSocket connection
- [ ] Pre-load "COVID Crash" scenario
- [ ] Prepare "Inject News" example text in clipboard
- [ ] Open Databricks notebook in separate tab (for showing code)
- [ ] Mute notifications
- [ ] Charge laptop to 100%

### During Presentation (5-7 minutes)

**Opening (30 seconds):**

- [ ] Introduce project: "Wolf of Wall Sweet — AI-powered stock market simulation"
- [ ] Show 3D city view (zoom out to show all 500 stores)

**Data Science Showcase (2 minutes):**

- [ ] Tab to Databricks notebook
- [ ] Show: "We ingest data from Yahoo Finance, GDELT news, Reddit, and FRED"
- [ ] Show: `sweetreturns.gold.news_sentiment` table (FinBERT scores)
- [ ] Show: Correlation graph visualization
- [ ] Show: HMM regime detection chart

**Live Demo (2 minutes):**

- [ ] Tab back to app
- [ ] Select "COVID Crash" scenario
- [ ] Scrub time slider: "Watch agents panic-sell as the market crashes"
- [ ] Zoom into AAPL store: "Agents are fleeing Apple"

**Live Hero Feature (1.5 minutes):**

- [ ] Click "Inject News" button
- [ ] Type: "Apple announces bankruptcy"
- [ ] Click "Inject"
- [ ] Show: Real-time sentiment analysis (-0.95 negative)
- [ ] Show: Agents fleeing AAPL store
- [ ] Show: GNN propagation to MSFT, GOOGL

**Technical Deep Dive (1 minute):**

- [ ] Explain: "100 agent archetypes using agent-based modeling"
- [ ] Explain: "Decisions made via softmax sampling (stochastic)"
- [ ] Explain: "Cloud computes decisions, frontend renders locally"

**Closing (30 seconds):**

- [ ] Recap: "FinBERT, GNN, HMM, ABM, Delta Lake, real-time ML"
- [ ] Thank judges
- [ ] Open for questions

---

## Backup Plan (If Things Break)

### If WebSocket Fails

- [ ] Fall back to REST API polling (fetch every 1 second)
- [ ] Show pre-recorded video of live feature working

### If Backend Crashes

- [ ] Use static JSON file (pre-exported scenario)
- [ ] Show backend code + architecture diagram instead

### If Databricks is Slow

- [ ] Show pre-captured screenshots of notebooks
- [ ] Show exported CSV files as proof

### If Frontend Lags

- [ ] Reduce agent count to 10K (not 500K)
- [ ] Disable particle effects
- [ ] Use simpler geometry

---

## Post-Hackathon Cleanup

### Within 24 Hours

- [ ] Delete Databricks cluster (stop billing)
- [ ] Delete AWS ECS service
- [ ] Delete S3 bucket (if no longer needed)
- [ ] Delete Azure resource group

### Within 1 Week

- [ ] Write blog post about project
- [ ] Upload demo video to YouTube
- [ ] Add project to portfolio / LinkedIn
- [ ] Submit to Devpost (if applicable)

---

## Success Metrics

**You've succeeded if:**

- ✅ Demo runs smoothly without crashes
- ✅ Judges see Databricks notebooks (proves DS work)
- ✅ Live news injection works (proves ML integration)
- ✅ Agents visibly react to sentiment/shocks (proves architecture works)
- ✅ Team can explain each DS technique confidently

**Bonus points if:**

- ✅ Judges try to break your live feature (and it handles gracefully)
- ✅ Judges ask technical questions about your ML models
- ✅ Demo gets applause or "wow" reactions
- ✅ You get invited to present at school or local meetup

---

## Emergency Contacts

**Databricks Support:**

- Community: <https://community.databricks.com>
- Docs: <https://docs.databricks.com>

**AWS Support:**

- Student help: <awseducate-support@amazon.com>
- Docs: <https://docs.aws.amazon.com>

**Azure Support:**

- Student help: <https://azureforeducation.microsoft.com/devtools>
- Docs: <https://docs.microsoft.com/azure>

**FastAPI Docs:**

- <https://fastapi.tiangolo.com>

**FinBERT Issues:**

- GitHub: <https://github.com/ProsusAI/finBERT>

---

## Motivational Reminder 💪

**You've got this!**

- You have a solid plan
- You have amazing datasets
- You have powerful tools (Databricks, ML models, cloud)
- You have a talented team

**Remember:**

- Done > Perfect
- Working demo > Beautiful code
- Judges care about **impact** and **technical depth**
- Your project is already 10x more impressive than most hackathon projects

**Now go build something amazing! 🚀**

---

## Quick Links

- **Main Roadmap:** `/hacklytics25/IMPLEMENTATION_ROADMAP.md`
- **Cloud Setup:** `/hacklytics25/CLOUD_SETUP_GUIDE.md`
- **DS Techniques:** `/hacklytics25/DATA_SCIENCE_GUIDE.md`
- **Current Code:** `/hacklytics25/wow-street/`

**Last updated:** 2026-02-21

# Wolf of Wall Sweet — Data Science Overhaul

**Transform your client-side graphics demo into a cloud-powered Data Science powerhouse for Hacklytics 2026**

---

## 📋 Project Overview

This repository contains a complete implementation roadmap to overhaul the "Wolf of Wall Sweet" project from a frontend-heavy WebGPU simulation into a sophisticated Data Science/AI project featuring:

- ☁️ **Cloud-based computation** (Databricks + Delta Lake)
- 🤖 **Advanced ML models** (FinBERT, GNN, HMM, BERTopic)
- 🎯 **Agent-Based Modeling** (100 behavioral archetypes)
- 📊 **Real-time data pipelines** (News, Reddit, Macroeconomic data)
- 🔌 **WebSocket streaming** (Cloud → Frontend)
- 🚀 **Live ML inference** (Real-time sentiment analysis)

---

## 📚 Documentation

This repository contains **4 comprehensive guides** totaling **over 15,000 words** of technical documentation:

### 1. **IMPLEMENTATION_ROADMAP.md** (Main Guide)
*Complete step-by-step roadmap for the entire overhaul*

**What's inside:**
- Current state analysis vs. target architecture
- Detailed "Macro-State Cloud, Micro-State Frontend" design
- 6 implementation phases with code examples
- 24-hour hackathon strategy ("Pre-compute + Live Hero")
- Team roles & responsibilities
- Hour-by-hour schedule

**Start here if:** You want the big picture and implementation plan

### 2. **CLOUD_SETUP_GUIDE.md** (Infrastructure)
*Complete cloud provider setup with step-by-step commands*

**What's inside:**
- Databricks on AWS setup (with AWS CLI commands)
- Databricks on Azure setup (with Azure CLI commands)
- Community Edition (free) setup
- Backend deployment (ECS, Railway, Docker)
- Frontend deployment (Vercel, Netlify)
- Environment variables & secrets management
- Cost optimization strategies
- Troubleshooting common issues

**Start here if:** You need to set up cloud infrastructure

### 3. **DATA_SCIENCE_GUIDE.md** (ML & Techniques)
*Deep dive into all advanced data science techniques*

**What's inside:**
- Agent-Based Modeling (ABM) implementation
- FinBERT sentiment analysis (with code)
- Graph Neural Networks for stock correlation
- Hidden Markov Models for regime detection
- BERTopic for news clustering
- Multi-Agent Reinforcement Learning
- Point-in-Time architecture (avoiding lookahead bias)
- Stochastic decision making (softmax sampling)

**Start here if:** You're implementing the ML models

### 4. **QUICKSTART_CHECKLIST.md** (Action Items)
*Printable hour-by-hour checklist for hackathon day*

**What's inside:**
- Pre-hackathon preparation checklist
- Hour-by-hour task breakdown (Hours 0-24)
- Team coordination guidelines
- Demo day checklist
- Backup plan for failures
- Emergency contacts

**Start here if:** It's hackathon day and you need a quick reference

---

## 🏗️ Architecture Overview

### Current Architecture (Graphics-Heavy)

```
┌──────────────────────────────────────┐
│         Browser (Client)             │
│                                      │
│  • WebGPU compute shaders            │
│  • 500K agent simulation             │
│  • Physics, collision detection      │
│  • All logic runs client-side        │
│                                      │
│  ❌ No cloud computation             │
│  ❌ No real ML models                │
│  ❌ No real-time data                │
└──────────────────────────────────────┘
```

### Target Architecture (Data Science-Powered)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD LAYER (Databricks)                     │
│  • Delta Lake (Medallion Architecture)                          │
│  • FinBERT Sentiment Analysis                                   │
│  • GNN Shock Propagation                                        │
│  • HMM Regime Detection                                         │
│  • 100 Agent Archetypes (ABM)                                   │
│  • Stochastic Decision Engine                                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ WebSocket (Lightweight JSON)
                       │ {"cohort": "retail_panic",
                       │  "target": "GME", "count": 10000}
┌──────────────────────▼──────────────────────────────────────────┐
│                   FRONTEND (React + Three.js)                    │
│  • WebGPU Renderer (Dumb, visual only)                          │
│  • Receives flow instructions                                   │
│  • Local physics, pathfinding                                   │
│  • 500K agent visualization                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Key Innovation:** Cloud computes "macro state" (archetype decisions), frontend renders "micro state" (individual agent visuals).

---

## 🎯 The 24-Hour Hackathon Strategy

### Pre-compute + Live Hero Approach

**Pre-compute (Hours 1-14):**
1. Pick 3 iconic historical events (COVID Crash, GME Squeeze, AI Boom)
2. Run heavy NLP, FinBERT, GNN, ABM offline
3. Save agent flows to Delta Lake
4. Build playback API

**Live Hero Feature (Hours 14-24):**
1. Build "Inject Fake News" text box
2. Connect to Databricks Model Serving (FinBERT)
3. Compute agent reactions in real-time
4. Broadcast via WebSocket

**Why This Wins:**
- ✅ Guaranteed working demo (pre-computed scenarios)
- ✅ Impressive live ML (real-time sentiment → agent reaction)
- ✅ Proves cloud architecture
- ✅ Won't crash during presentation

---

## 💻 Tech Stack

### Data & ML
- **Databricks** — Spark, Delta Lake, Model Serving
- **Python** — Pandas, PySpark, NumPy, SciPy
- **Transformers** — FinBERT (ProsusAI/finbert)
- **Sentence Transformers** — BERTopic embeddings
- **NetworkX** — Graph algorithms (GNN)
- **hmmlearn** — Hidden Markov Models

### Backend
- **FastAPI** — REST API + WebSocket server
- **Databricks SQL Connector** — Query Delta tables
- **Redis** — (Optional) Caching
- **Docker** — Containerization

### Frontend (Existing)
- **React 19** + TypeScript
- **Three.js** — 3D rendering
- **Zustand** — State management
- **WebGPU** — Particle simulation

### Cloud Infrastructure
- **AWS** — S3, ECS, ECR, IAM
- **Azure** — Blob Storage, Container Instances
- **Vercel** — Frontend hosting
- **Railway** — (Alternative) Backend hosting

---

## 📊 Data Sources

### Primary Data
- **Yahoo Finance** (Kaggle) — 500 stocks, 5 years, daily OHLCV
- **GDELT** — Financial news articles (real-time, free)
- **Reddit** (Pushshift) — WallStreetBets historical posts
- **FRED API** — Macroeconomic indicators (VIX, Fed rate, CPI)

### Derived Features
- **50+ Technical Indicators** — RSI, MACD, Bollinger Bands, ATR
- **Golden Tickets** — 5-tier scoring system (drawdown, volume, volatility, skew, regime)
- **Sentiment Scores** — FinBERT on news headlines
- **Correlation Matrix** — 500×500 Pearson correlation
- **Market Regimes** — Bull/Bear/Neutral (HMM)

---

## 🚀 Quick Start

### For First-Time Setup (Pre-Hackathon)

```bash
# 1. Clone repository
cd /path/to/hacklytics25

# 2. Read the main roadmap
open IMPLEMENTATION_ROADMAP.md

# 3. Set up cloud (follow guide)
open CLOUD_SETUP_GUIDE.md

# 4. Test local backend
cd wow-street/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 5. Test local frontend
cd ../
npm install
npm run dev
```

### For Hackathon Day

```bash
# 1. Print the checklist
open QUICKSTART_CHECKLIST.md
# (Print or keep open in separate window)

# 2. Follow hour-by-hour tasks
# Each team member has assigned tasks per hour

# 3. Reference DS guide as needed
open DATA_SCIENCE_GUIDE.md
```

---

## 👥 Team Roles

### 4-Person Team Split

| Role | Responsibilities | Hours 0-12 | Hours 12-24 |
|------|------------------|------------|-------------|
| **Data Engineer** | Databricks, pipelines | Set up cluster, run bronze→silver→gold | Pre-compute scenarios, export JSON |
| **ML Engineer** | Models, training | Train FinBERT, GNN, HMM | Deploy Model Serving, tune parameters |
| **Backend Dev** | FastAPI, WebSocket | Build API structure, connect to Databricks | Implement live news feature, deploy |
| **Frontend Dev** | React, Three.js | Integrate WebSocket client | Build News Injector UI, polish |

---

## 🎤 Demo Talking Points

**What to emphasize to judges:**

1. **"We use FinBERT, a BERT model fine-tuned on 10K+ financial articles"**
   - Show Databricks notebook with sentiment analysis

2. **"Our Graph Neural Network models stock correlations—shocks propagate through the supply chain"**
   - Show correlation graph visualization
   - Demo: "When TSMC has bad news, it hits Apple, Nvidia, Qualcomm"

3. **"We detect market regimes using Hidden Markov Models—during bear markets, agent fear increases 50%"**
   - Show regime detection chart (Bull/Bear/Neutral)

4. **"We model 100 behavioral archetypes using agent-based modeling from behavioral economics"**
   - Show archetype table with risk_tolerance, greed, fear, strategy

5. **"Our decision engine uses softmax sampling for stochastic, human-like behavior"**
   - Show code snippet

6. **"Delta Lake ensures point-in-time correctness via time travel"**
   - Show: `SELECT * FROM table TIMESTAMP AS OF '2020-03-01'`

7. **"This is the only project that combines NLP, graph neural networks, Bayesian inference, and real-time ML in a single system"**

---

## 📦 Deliverables

### What Judges Will See

1. **Live Demo** (5 minutes)
   - Scenario playback (COVID Crash)
   - Live news injection ("Apple announces bankruptcy")
   - Real-time agent reaction

2. **Databricks Notebooks** (Proof of DS work)
   - Bronze/Silver/Gold pipeline
   - ML model training notebooks
   - Agent decision engine

3. **Architecture Diagram**
   - Cloud → Backend → Frontend flow
   - Data sources and transformations

4. **GitHub Repository**
   - Clean, documented code
   - README with setup instructions

---

## 💰 Cost Estimates

### 24-Hour Hackathon

| Service | Cost |
|---------|------|
| Databricks Cluster (14 hrs) | $45 |
| S3/Azure Storage | $2 |
| ECS/Container hosting | $12 |
| Data transfer | $5 |
| **Total** | **$64** |

**With optimizations:** $30-40
- Use Community Edition for first 16 hours (free)
- Use spot instances (60% cheaper)
- Auto-terminate clusters

---

## 🐛 Common Issues & Solutions

### Databricks won't start
- **Fix:** Reduce cluster size to 1 worker, try different region

### FinBERT too slow
- **Fix:** Use batching, cache results, or CPU-only mode

### WebSocket fails
- **Fix:** Check CORS, use polling fallback, verify firewall

### Out of memory
- **Fix:** Increase cluster size, use `repartition()`, cache intermediate results

### Vercel build timeout
- **Fix:** Build locally, deploy with `vercel --prebuilt`

**See CLOUD_SETUP_GUIDE.md for detailed troubleshooting**

---

## 📈 Success Metrics

**You've succeeded if:**
- ✅ Demo runs without crashes
- ✅ Judges see Databricks notebooks (proves DS work)
- ✅ Live news injection works (proves ML integration)
- ✅ Agents react to sentiment/shocks (proves architecture)
- ✅ Team explains each DS technique confidently

**Bonus points:**
- ✅ Judges try to break your system (and it handles gracefully)
- ✅ Technical questions about ML models
- ✅ Applause or "wow" reactions
- ✅ Top 3 placement

---

## 📞 Support & Resources

### Official Docs
- [Databricks Docs](https://docs.databricks.com)
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [FinBERT GitHub](https://github.com/ProsusAI/finBERT)
- [BERTopic Docs](https://maartengr.github.io/BERTopic/)

### Community Help
- [Databricks Community](https://community.databricks.com)
- [r/MachineLearning](https://reddit.com/r/MachineLearning)
- [FastAPI Discord](https://discord.gg/fastapi)

### Emergency Contacts
- AWS Support: awseducate-support@amazon.com
- Azure Support: azureforeducation.microsoft.com/devtools
- Databricks Support: community.databricks.com

---

## 🏆 Why This Will Win

**1. Technical Depth**
- Not just a visualization—real ML models
- FinBERT, GNN, HMM, BERTopic
- Delta Lake, time travel, point-in-time correctness

**2. Architecture Excellence**
- Cloud-based, scalable
- Decoupled services (backend, frontend, ML)
- Real-time streaming (WebSocket)

**3. Data Science Showcase**
- Multi-source data integration
- Advanced feature engineering
- Agent-based modeling
- Behavioral economics

**4. Live Demo Impact**
- Pre-computed scenarios (guaranteed to work)
- Live ML inference (impressive + interactive)
- Real-time visualization (beautiful)

**5. Presentation Quality**
- Can explain every DS technique
- Can show code + notebooks
- Can demonstrate end-to-end flow

---

## 🎓 Learning Outcomes

By completing this project, you'll learn:
- ☁️ Cloud data engineering (Databricks, Delta Lake)
- 🤖 NLP with transformers (FinBERT, BERT)
- 📊 Graph algorithms (GNN, correlation networks)
- 📈 Time series analysis (HMM, regime detection)
- 🔧 Backend engineering (FastAPI, WebSocket)
- 🎨 Frontend integration (React, Three.js)
- 🏗️ System architecture (distributed systems)
- 🎤 Technical presentation skills

---

## 📅 Timeline

### Pre-Hackathon (1 week before)
- Set up cloud accounts
- Get API keys
- Test Databricks cluster
- Review documentation

### Hackathon Day (24 hours)
- **Hours 0-6:** Infrastructure + data pipeline
- **Hours 6-14:** ML models + pre-computation
- **Hours 14-20:** Backend + frontend integration
- **Hours 20-24:** Live feature + polish

### Post-Hackathon
- Write blog post
- Upload demo video
- Add to portfolio
- Apply learnings to future projects

---

## 🚀 Final Words

**You have everything you need:**
- ✅ Detailed roadmap
- ✅ Complete code examples
- ✅ Cloud setup guides
- ✅ ML implementation tutorials
- ✅ Hour-by-hour checklist
- ✅ Troubleshooting solutions

**Now it's time to execute.**

This is not just a hackathon project—it's a **portfolio piece** that demonstrates:
- Advanced data engineering
- Production ML deployment
- Complex system architecture
- Real-time data processing

**Go build something amazing. Good luck! 🏆**

---

## 📄 License

This project is part of Hacklytics 2026. All documentation and code examples are provided for educational purposes.

**Original Wolf of Wall Sweet project:** See `wow-street/` directory

**Overhaul documentation:** This README and associated guides

---

## 🙏 Acknowledgments

- **Hacklytics 2026** — For hosting the event
- **Databricks** — For providing cloud platform
- **ProsusAI** — For open-sourcing FinBERT
- **You** — For taking on this ambitious project

**Now go crush it! 💪**

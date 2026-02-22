Deployment
==========

The application is deployed on Vercel with Databricks as the data backend.

Vercel Setup
------------

The app auto-deploys from GitHub on push to ``main``:

- **Domain:** wolfofwallsweet.tech
- **Framework:** Vite (React)
- **Serverless Functions:** Python handlers in ``api/``
- **Cron Jobs:** Configured in ``vercel.json``

Required Environment Variables (Vercel Dashboard):

+-----------------------------------+-------------------------------------------+
| Variable                          | Description                               |
+===================================+===========================================+
| ``DATABRICKS_HOST``               | Workspace URL (https://xxx.cloud...)      |
+-----------------------------------+-------------------------------------------+
| ``DATABRICKS_TOKEN``              | Personal access token                     |
+-----------------------------------+-------------------------------------------+
| ``DATABRICKS_SQL_WAREHOUSE_PATH`` | SQL Warehouse HTTP path                   |
+-----------------------------------+-------------------------------------------+
| ``CRON_SECRET`` (optional)        | Auth token for advance endpoint           |
+-----------------------------------+-------------------------------------------+

Databricks Setup
----------------

1. Create a cluster named ``sweetreturns``
2. Run the full pipeline once:

   .. code-block:: bash

      python databricks/cli_pipeline.py --step all

3. (Optional) Create the scheduled job:

   .. code-block:: bash

      python databricks/cli_pipeline.py --step create-job
      python databricks/cli_pipeline.py --step start-loop

Even without step 3, the Vercel cron and frontend auto-trigger will
keep the pipeline advancing.

Building Documentation
----------------------

Sphinx documentation lives in ``docs/``:

.. code-block:: bash

   cd docs
   make html

Output is generated in ``docs/_build/html/``.

To deploy docs to Vercel alongside the app, the build output is copied
to ``public/docs/`` during the build process.

Frontend Build
--------------

.. code-block:: bash

   npm install
   npm run build     # TypeScript check + production build
   npm run dev       # Local development server

Testing Endpoints
-----------------

.. code-block:: bash

   # Health check
   curl https://wolfofwallsweet.tech/api/health

   # Stock data
   curl https://wolfofwallsweet.tech/api/stocks

   # Trigger advance
   curl https://wolfofwallsweet.tech/api/advance

   # Pipeline status
   curl https://wolfofwallsweet.tech/api/advance_status

   # Submit simulation (POST)
   curl -X POST https://wolfofwallsweet.tech/api/simulation \\
     -H "Content-Type: application/json" \\
     -d '{"snapshot_date":"2017-11-10","trades":[],"crowd_metrics":[]}'

   # Simulation history
   curl https://wolfofwallsweet.tech/api/simulation_history

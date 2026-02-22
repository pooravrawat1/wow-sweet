# Sphinx configuration for Wolf of Wall Sweet documentation

project = 'Wolf of Wall Sweet'
copyright = '2026, SweetReturns Team'
author = 'SweetReturns Team'
release = '1.0.0'

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.viewcode',
    'sphinx.ext.napoleon',
]

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

html_theme = 'sphinx_rtd_theme'
html_static_path = []

html_theme_options = {
    'navigation_depth': 3,
    'collapse_navigation': False,
    'logo_only': False,
}

# Add source directory to sys.path for autodoc
import os
import sys
sys.path.insert(0, os.path.abspath('../databricks'))
sys.path.insert(0, os.path.abspath('../api'))

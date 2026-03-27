---
name: quant-analysis
description: "Quantitative finance analysis including portfolio optimization, risk modeling, and time series econometrics using jupyter_execute. Use when the user asks about portfolio analysis, stock returns, financial risk, investment optimization, or volatility modeling."
---

# Quantitative Analysis Skill

## Description
Perform quantitative finance research including data analysis, portfolio optimization, risk modeling, and econometric analysis.

## Tools Used
- `jupyter_execute` - Execute Python code for financial analysis (auto-switches to Jupyter)
- `jupyter_notebook` - Manage analysis notebooks
- `update_notebook` - Set up analysis cells in Jupyter
- `update_latex` - Write finance paper content to LaTeX editor
- `latex_compile` - Compile research papers (auto-switches to LaTeX editor)
- `update_notes` - Write analysis summaries and findings

## Capabilities

### Data Analysis
- Time series analysis of financial returns
- Cross-sectional regression (Fama-MacBeth, panel data)
- Event studies and abnormal return analysis
- Volatility modeling (GARCH family)

### Portfolio Optimization
- Mean-variance optimization (Markowitz)
- Black-Litterman model with views
- Risk parity and equal risk contribution
- Factor-based portfolio construction

### Risk Analysis
- Value-at-Risk (VaR) and Conditional VaR
- Stress testing and scenario analysis
- Copula-based dependency modeling
- Monte Carlo simulation

## Usage Patterns

### Analyze Returns
When user says: "Analyze the performance of [asset/portfolio]"
1. Load price data using pandas/yfinance
2. Calculate returns, volatility, Sharpe ratio
3. Plot cumulative returns and drawdowns
4. Run statistical tests (normality, autocorrelation)
5. Present findings with charts

### Build a Model
When user says: "Build a [pricing/risk/factor] model"
1. Clarify model specification and data requirements
2. Load and clean data
3. Estimate model parameters
4. Validate with out-of-sample testing
5. Report results with diagnostics

## Tool Examples

### Load and analyze stock returns
```python
# via jupyter_execute
import yfinance as yf
import pandas as pd
import numpy as np

data = yf.download("AAPL", start="2023-01-01", end="2024-01-01")
returns = data["Close"].pct_change().dropna()
print(f"Mean: {returns.mean():.4f}, Vol: {returns.std():.4f}, Sharpe: {returns.mean()/returns.std()*np.sqrt(252):.2f}")
```

### Validation checkpoints
- Verify data has no missing values or extreme outliers before modeling
- Check model residuals for autocorrelation after estimation
- Confirm out-of-sample period has no look-ahead bias

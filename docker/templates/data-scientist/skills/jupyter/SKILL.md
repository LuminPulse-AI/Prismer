---
name: jupyter
description: "Create and execute Jupyter notebooks for interactive data analysis using jupyter_execute and jupyter_notebook tools. Use when the user asks to run Python code interactively, create notebooks, analyze data in cells, or mentions .ipynb files."
---

# Jupyter Notebook Skill

## Description
Create and execute Jupyter notebooks for interactive data analysis and visualization.

## Tools Used
- `jupyter_execute` - Execute Python code in Jupyter kernel (auto-switches to Jupyter)
- `jupyter_notebook` - Create, read, update, delete, and list notebooks
- `update_notebook` - Add or update cells in the notebook without executing
- `update_gallery` - Display generated plots and visualizations in gallery view
- `update_data_grid` - Display structured tabular data (DataFrames, query results) in AG Grid
- `update_code` - Show code examples and scripts in the Code Playground
- `save_artifact` - Save generated artifacts (plots, data files) to workspace collection

## Capabilities

- Create new notebooks with proper structure
- Add and execute code cells
- Add markdown documentation cells
- Display inline visualizations
- Display tabular data in interactive grid view
- Show code examples with syntax highlighting
- Export to various formats (HTML, PDF)

## Usage Patterns

### Create Analysis Notebook
When user says: "Create a notebook for [analysis]"
1. Create notebook with title and imports
2. Add data loading cell
3. Add exploration cells
4. Structure with markdown headers
5. Execute cells sequentially

### Execute and Debug
When user says: "Run this code"
1. Execute cell
2. Capture output and errors
3. If error, diagnose and fix
4. Show results or visualizations

### Document Workflow
When user says: "Add explanation for this step"
1. Add markdown cell before code
2. Explain methodology
3. Note assumptions and limitations

## Tool Examples

### Execute Python code
```
jupyter_execute code="import pandas as pd\ndf = pd.read_csv('/workspace/data/results.csv')\nprint(df.describe())"
```

### Create a notebook with cells
```
update_notebook cells=[{"type": "markdown", "source": "# Analysis"}, {"type": "code", "source": "import pandas as pd\nimport matplotlib.pyplot as plt"}] execute=false
```

### Display generated plots
```
update_gallery images=[{"url": "/workspace/data/plot.png", "title": "Analysis Results"}]
```

## Best Practices

1. **Cell Independence**: Each cell should run independently when possible
2. **Import First**: All imports at notebook start
3. **Check output before proceeding**: Verify execution output is correct before running dependent cells
4. **Markdown Structure**: Use headers for navigation
5. **Save Often**: Checkpoint regularly

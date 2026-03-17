---
name: data-analysis
description: "Load, analyze, and visualize datasets using pandas with AG Grid display. Use when the user asks to analyze CSV data, explore a dataframe, create charts, filter tabular data, or display spreadsheet-like results."
---

# Data Analysis Skill

## Description
Load data files (CSV, XLSX, JSON, Parquet) into the AG Grid viewer, run pandas queries, save results, and generate visualizations.

## Tools Used

### Primary (Data Grid workflow)
- `data_list` - List available data files in /workspace/data/
- `data_load` - Load a data file into AG Grid (returns markdown preview for context)
- `data_query` - Execute pandas operations on loaded data (filter, aggregate, transform)
- `data_save` - Save the current DataFrame to a file

### Secondary (Jupyter workflow for visualization)
- `jupyter_execute` - Execute Python code in Jupyter kernel (for plots and complex analysis)
- `update_notebook` - Add cells to Jupyter notebook
- `update_gallery` - Display generated plots in the gallery

## Workflow

### Recommended: Data Grid Workflow
For tabular data exploration, use the data tools which provide a spreadsheet-like experience:

1. **List files**: `data_list` to see what's in /workspace/data/
2. **Load data**: `data_load` to read a file and display in AG Grid
   - You'll receive a markdown preview to understand columns and types
3. **Query/Filter**: `data_query` to run pandas operations
   - The `df` variable contains the loaded data
   - Set `result = ...` to define output
4. **Save results**: `data_save` to export to CSV/XLSX

### Alternative: Jupyter Workflow
For visualization, statistical analysis, or ML, use Jupyter tools:

1. Load data with `jupyter_execute` running pandas code
2. Create visualizations with matplotlib/seaborn
3. Display plots with `update_gallery`

## Usage Patterns

### Load and Explore Data
When user says: "Analyze this dataset" or "Show me the data"
1. `data_list` to find available files
2. `data_load` with the target file
3. Review the markdown preview to understand structure
4. `data_query` with `result = df.describe()` for statistics
5. Offer filtering, sorting, or visualization

### Filter and Transform
When user says: "Show only rows where X > Y" or "Group by category"
1. `data_query` with pandas filter/groupby code
2. Grid updates automatically with filtered results
3. Inform user of result count and preview

### Save Processed Data
When user says: "Export this" or "Save as Excel"
1. `data_save` with desired filename and format
2. Report file location and size

### Visualize Data
When user says: "Create a chart" or "Plot the distribution"
1. Use `jupyter_execute` with matplotlib/seaborn code
2. Save plot and display via `update_gallery`

## Code Snippets for data_query

### Filter rows
```python
result = df[df['score'] > 90]
```

### Group and aggregate
```python
result = df.groupby('category').agg({'value': ['mean', 'sum', 'count']}).reset_index()
```

### Sort by column
```python
result = df.sort_values('date', ascending=False)
```

### Add computed column
```python
df['ratio'] = df['value_a'] / df['value_b']
result = df
```

### Summary statistics
```python
result = df.describe()
```

### Handle missing values
```python
result = df.dropna(subset=['important_column'])
```

## Best Practices

1. **Start with data_list**: Always check what files are available first
2. **Use data_load first**: Load data to get markdown preview before querying
3. **Keep queries simple**: One operation per data_query call for clarity
4. **Save intermediate results**: Use data_save for important filtered datasets
5. **Switch to Jupyter for plots**: AG Grid is for tabular data, use Jupyter for visualizations

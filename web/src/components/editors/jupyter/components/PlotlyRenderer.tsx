'use client';

/**
 * PlotlyRenderer - Renders Plotly Charts
 *
 * Dynamically loads plotly.js to reduce initial bundle size
 */

import React, { useEffect, useRef, useState } from 'react';

interface PlotlyRendererProps {
  data: unknown;
}

// Plotly chart data type
interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export default function PlotlyRenderer({ data }: PlotlyRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function renderPlot() {
      if (!containerRef.current || !data) return;

      try {
        // Dynamically import plotly.js
        // @ts-expect-error - plotly.js-dist-min may not be installed
        const Plotly = await import('plotly.js-dist-min').catch(() => null);
        
        if (!mounted) return;

        if (!Plotly) {
          // If plotly is not installed, show a message
          setError('Plotly.js not installed. Run: npm install plotly.js-dist-min');
          setIsLoading(false);
          return;
        }

        const figure = data as PlotlyFigure;
        
        // Merge with default config
        const layout = {
          ...figure.layout,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(30, 41, 59, 0.5)',
          font: { color: '#94a3b8' },
          autosize: true,
          margin: { l: 50, r: 30, t: 30, b: 50 },
        };

        const config = {
          ...figure.config,
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        };

        await Plotly.newPlot(
          containerRef.current, 
          figure.data, 
          layout, 
          config
        );

        setIsLoading(false);
      } catch (err) {
        console.error('Plotly render error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render chart');
        setIsLoading(false);
      }
    }

    renderPlot();

    return () => {
      mounted = false;
      if (containerRef.current) {
        // Clean up Plotly instance
        // @ts-expect-error - plotly.js-dist-min may not be installed
        import('plotly.js-dist-min')
          .then((Plotly: { purge: (el: HTMLElement) => void }) => {
            if (containerRef.current) {
              Plotly.purge(containerRef.current);
            }
          })
          .catch(() => {});
      }
    };
  }, [data]);

  if (error) {
    return (
      <div className="px-4 py-3 bg-yellow-900/20 text-yellow-400 text-sm">
        <div className="font-medium">Chart Error</div>
        <div className="text-yellow-400/70 text-xs mt-1">{error}</div>
        
        {/* Show raw JSON data */}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-yellow-400/50 hover:text-yellow-400">
            View raw data
          </summary>
          <pre className="mt-2 text-xs font-mono text-slate-400 overflow-auto max-h-40">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full min-h-[300px]"
        style={{ visibility: isLoading ? 'hidden' : 'visible' }}
      />
    </div>
  );
}

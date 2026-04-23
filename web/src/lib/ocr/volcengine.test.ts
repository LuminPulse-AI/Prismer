import { describe, expect, it } from 'vitest';
import { buildOCRDatasetFromVolcengineResult } from './volcengine';

describe('buildOCRDatasetFromVolcengineResult', () => {
  it('maps Volcengine page detail into the local OCR dataset contract', () => {
    const dataset = buildOCRDatasetFromVolcengineResult({
      paperId: 'demo-paper',
      result: {
        markdown: '# Demo Paper\n\nHello world',
        num_pages: 1,
        detail: [
          {
            page_id: 1,
            page_md: '# Demo Paper\n\nHello world',
            page_image_hw: {
              w: 1200,
              h: 1600,
            },
            text_blocks: [
              {
                label: 'title',
                text: 'Demo Paper',
                box: { x0: 10, y0: 20, x1: 500, y1: 120 },
              },
              {
                label: 'text',
                text: 'Hello world',
                box: { x0: 10, y0: 140, x1: 600, y1: 260 },
              },
              {
                label: 'table',
                text: '| a | b |',
                box: { x0: 10, y0: 280, x1: 700, y1: 420 },
                table_html: '<table><tr><td>a</td><td>b</td></tr></table>',
              },
            ],
          },
        ],
      },
    });

    expect(dataset.metadata.title).toBe('Demo Paper');
    expect(dataset.metadata.total_pages).toBe(1);
    expect(dataset.ocrResult.markdown_content).toContain('Hello world');
    expect(dataset.ocrResult.pages[0]?.meta.width).toBe(1200);
    expect(dataset.detections).toHaveLength(1);
    expect(dataset.detections[0]?.detections).toHaveLength(3);
    expect(dataset.detections[0]?.detections[0]?.label).toBe('title');
    expect(dataset.detections[0]?.detections[2]?.metadata?.table_html).toContain('<table>');
  });
});

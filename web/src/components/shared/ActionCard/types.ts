/**
 * ActionCard Types
 *
 * Generic agent action type definitions
 */

/** Agent action type */
export type AgentActionType =
  | 'search_papers'
  | 'analyze_paper'
  | 'draw_conclusion'
  | 'write_content'
  | 'execute_code'
  | 'thinking';

/** Action status */
export type ActionStatus = 'pending' | 'running' | 'completed' | 'error';

/** Paper reference */
export interface PaperReference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  doi?: string;
  citations?: number;
  source: 'arxiv' | 'semantic_scholar' | 'google_scholar';
}

/** Agent action */
export interface AgentAction {
  id: string;
  type: AgentActionType;
  status: ActionStatus;
  description: string;
  timestamp: string;
  duration?: number;
  data?: {
    // search_papers
    query?: string;
    papers?: PaperReference[];
    // analyze_paper
    paperId?: string;
    analysis?: string;
    keyPoints?: string[];
    // draw_conclusion
    conclusion?: string;
    // write_content
    content?: string;
    section?: string;
    position?: 'append' | 'replace' | 'insert';
    lineNumber?: number;
    // execute_code
    code?: string;
    language?: string;
    output?: string;
    // general
    [key: string]: unknown;
  };
}

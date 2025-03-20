import { Graph, AgentContext } from '../base/types';
import { SearchAgent } from '../search-agent';
import { ResponseAgent } from '../response-agent';
import { SummaryAgent } from '../summary-agent';
import { WorkflowManager } from './workflow-manager';
import { config } from '../../../config';

// Event types for workflow
interface WorkflowEvents {
  onToken?: (token: string) => void;
  onToolStart?: (tool: string) => void;
  onToolEnd?: (tool: string, result: any) => void;
  onComplete?: (result: any) => void;
}

export class WorkflowFactory {
  static createChatWorkflow(initialContext: AgentContext, events?: WorkflowEvents): WorkflowManager {
    const nodes = [];
    const edges = [];

    // Initialize agents that might be needed
    const searchAgent = new SearchAgent({
      config: {
        name: 'search_agent',
        description: 'Performs internet searches for current information',
        model: config.llm.defaultModel
      }
    });

    const summaryAgent = new SummaryAgent({
      config: {
        name: 'summary_agent',
        description: 'Summarizes content based on mode (search/chat/voice)',
        model: config.llm.defaultModel,
        temperature: 0.3
      }
    });

    const responseAgent = new ResponseAgent({
      config: {
        name: 'response_agent',
        description: 'Generates final responses using available information',
        model: config.llm.defaultModel,
        temperature: 0.7
      }
    });

    // Add nodes based on flags
    if (initialContext.flags?.needsSearch) {
      nodes.push({ id: 'search', agent: searchAgent });
      if (initialContext.flags?.needsSummary && initialContext.flags?.summaryMode === 'search') {
        nodes.push({ id: 'summary', agent: summaryAgent });
        edges.push({ from: 'search', to: 'summary' });
        edges.push({ from: 'summary', to: 'response' });
      } else {
        edges.push({ from: 'search', to: 'response' });
      }
    } else if (initialContext.flags?.needsSummary) {
      nodes.push({ id: 'summary', agent: summaryAgent });
      edges.push({ from: 'summary', to: 'response' });
    }

    // Response agent is always needed
    nodes.push({ id: 'response', agent: responseAgent });

    // Define workflow graph
    const graph: Graph = { nodes, edges };

    // Create and return workflow manager
    return new WorkflowManager(graph, initialContext, events);
  }
} 
import { AgentContext, AgentExecutor, AgentResult, Graph, WorkflowState } from '../base/types';
import { WorkflowNode } from './types';
import logger from '../../../utils/logger';

export interface WorkflowEvents {
  onToken?: (token: string) => void;
  onToolStart?: (tool: string) => void;
  onToolEnd?: (tool: string, result: any) => void;
  onComplete?: (result: AgentResult) => void;
}

export class WorkflowManager {
  private state: {
    context: AgentContext;
    currentNode?: WorkflowNode;
  };

  private nodes: Map<string, WorkflowNode>;
  private edges: Map<string, string[]>;
  private events?: WorkflowEvents;

  constructor(graph: Graph, initialContext: AgentContext, events?: WorkflowEvents) {
    this.state = {
      context: initialContext
    };

    this.nodes = new Map();
    this.edges = new Map();
    this.events = events;

    // Initialize from graph
    graph.nodes.forEach(node => {
      this.nodes.set(node.id, {
        id: node.id,
        executor: node.agent,
        condition: node.condition
      });
    });

    graph.edges.forEach(edge => {
      const edges = this.edges.get(edge.from) || [];
      edges.push(edge.to);
      this.edges.set(edge.from, edges);
    });

    logger.info('Workflow manager initialized', {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size
    });
  }

  addNode(id: string, executor: AgentExecutor, condition?: (context: AgentContext) => Promise<boolean> | boolean): void {
    this.nodes.set(id, { id, executor, condition });
  }

  addEdge(fromId: string, toId: string): void {
    const edges = this.edges.get(fromId) || [];
    edges.push(toId);
    this.edges.set(fromId, edges);
  }

  private async evaluateCondition(node: WorkflowNode): Promise<boolean> {
    if (!node.condition) {
      return true;
    }
    return node.condition(this.state.context);
  }

  async execute(startNodeId: string): Promise<AgentResult> {
    let currentNodeId = startNodeId;
    let finalResult: AgentResult | null = null;

    logger.info('Starting workflow execution', { startNode: startNodeId });

    while (currentNodeId) {
      const node = this.nodes.get(currentNodeId);
      if (!node) {
        throw new Error(`Node ${currentNodeId} not found`);
      }

      try {
        // Check if we should execute this node
        if (await this.evaluateCondition(node)) {
          logger.info('Executing workflow node', {
            nodeId: currentNodeId,
            agent: node.executor.constructor.name
          });

          if (this.events?.onToolStart) {
            this.events.onToolStart(currentNodeId);
          }

          const result = await node.executor.execute(this.state.context);
          this.state.context = result.context;
          finalResult = result;

          if (this.events?.onToolEnd) {
            this.events.onToolEnd(currentNodeId, result);
          }

          logger.info('Node execution completed', {
            nodeId: currentNodeId,
            hasOutput: !!result.output
          });
        }

        // Get next node
        const nextNodes = this.edges.get(currentNodeId) || [];
        currentNodeId = nextNodes[0]; // For now, just take the first edge

        logger.debug('Moving to next node', {
          current: currentNodeId,
          nextNodes
        });
      } catch (error) {
        logger.error('Workflow execution failed', {
          nodeId: currentNodeId,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error)
        });
        throw error;
      }
    }

    if (this.events?.onComplete && finalResult) {
      this.events.onComplete(finalResult);
    }

    logger.info('Workflow execution completed');

    return {
      output: finalResult?.output || 'Workflow completed',
      context: this.state.context
    };
  }
} 
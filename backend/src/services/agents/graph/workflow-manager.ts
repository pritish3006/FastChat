/**
 * Workflow Manager
 * 
 * This module manages the execution of complex workflows using a directed graph of nodes and edges.
 * It provides methods to add nodes, edges, and execute the workflow from a starting node.
 * 
 * The workflow is represented as a directed graph where:
 * - Nodes are agents that perform specific tasks (query, search, voice, etc.)
 * - Edges define the flow between agents
 * - Each node can have a condition that determines if it should execute
 * - Execution flows from node to node until completion
 */

import { AgentContext, AgentExecutor, AgentResult, Graph, WorkflowState } from '../base/types';
import { WorkflowNode } from './types';
import logger from '../../../utils/logger';

/**
 * Events that can be subscribed to during workflow execution
 */
export interface WorkflowEvents {
  /** Called when a token is generated during execution */
  onToken?: (token: string) => void;
  /** Called when a tool/agent starts executing */
  onToolStart?: (tool: string) => void;
  /** Called when a tool/agent completes execution */
  onToolEnd?: (tool: string, result: any) => void;
  /** Called when the entire workflow completes */
  onComplete?: (result: AgentResult) => void;
}

/**
 * Manages the execution of a workflow composed of multiple agents
 */
export class WorkflowManager {
  /** Current state of the workflow including context and current node */
  private state: {
    context: AgentContext;
    currentNode?: WorkflowNode;
  };

  /** Map of node IDs to their definitions */
  private nodes: Map<string, WorkflowNode>;
  /** Map of node IDs to arrays of target node IDs they connect to */
  private edges: Map<string, string[]>;
  /** Optional event handlers for workflow execution */
  private events?: WorkflowEvents;

  /**
   * Creates a new workflow manager instance
   * @param graph - The workflow graph definition
   * @param initialContext - Initial context for the workflow
   * @param events - Optional event handlers
   */
  constructor(graph: Graph, initialContext: AgentContext, events?: WorkflowEvents) {
    this.state = {
      context: initialContext
    };

    this.nodes = new Map();
    this.edges = new Map();
    this.events = events;

    // Initialize nodes from graph definition
    graph.nodes.forEach(node => {
      this.nodes.set(node.id, {
        id: node.id,
        executor: node.agent,
        condition: node.condition
      });
    });

    // Initialize edges from graph definition
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

  /**
   * Adds a new node to the workflow
   * @param id - Unique identifier for the node
   * @param executor - Agent that will execute this node's logic
   * @param condition - Optional condition that determines if node should execute
   */
  addNode(id: string, executor: AgentExecutor, condition?: (context: AgentContext) => Promise<boolean> | boolean): void {
    this.nodes.set(id, { id, executor, condition });
  }

  /**
   * Adds a directed edge between two nodes
   * @param fromId - Source node ID
   * @param toId - Target node ID
   */
  addEdge(fromId: string, toId: string): void {
    const edges = this.edges.get(fromId) || [];
    edges.push(toId);
    this.edges.set(fromId, edges);
  }

  /**
   * Evaluates whether a node should execute based on its condition
   * @param node - The node to evaluate
   * @returns Promise resolving to true if node should execute, false otherwise
   */
  private async evaluateCondition(node: WorkflowNode): Promise<boolean> {
    if (!node.condition) {
      return true;
    }
    return node.condition(this.state.context);
  }

  /**
   * Executes the workflow starting from the specified node
   * @param startNodeId - ID of the node to start execution from
   * @returns Promise resolving to the final result of the workflow
   * @throws Error if a node is not found or execution fails
   */
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
        // Check if we should execute this node based on its condition
        if (await this.evaluateCondition(node)) {
          logger.info('Executing workflow node', {
            nodeId: currentNodeId,
            agent: node.executor.constructor.name
          });

          // Emit tool start event if handler exists
          if (this.events?.onToolStart) {
            this.events.onToolStart(currentNodeId);
          }

          // Execute the node and update context with result
          const result = await node.executor.execute(this.state.context);
          this.state.context = result.context;
          finalResult = result;

          // Emit tool end event if handler exists
          if (this.events?.onToolEnd) {
            this.events.onToolEnd(currentNodeId, result);
          }

          logger.info('Node execution completed', {
            nodeId: currentNodeId,
            hasOutput: !!result.output
          });
        }

        // Find and move to next node in the workflow
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

    // Emit completion event if handler exists
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
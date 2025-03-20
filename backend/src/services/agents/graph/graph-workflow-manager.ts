import { EventEmitter } from 'events';
import {
  AgentContext,
  Edge,
  Graph,
  Node,
  WorkflowState
} from '../base/types';
import logger from '../../../utils/logger';
import { BaseAgent } from '../base/base-agent';

export class GraphWorkflowManager extends EventEmitter {
  private graph: Graph;
  private state: WorkflowState;
  private visited: Set<string>;
  private currentNode: Node | null;

  constructor(graph: Graph, initialContext: AgentContext) {
    super();
    this.graph = graph;
    this.state = {
      context: initialContext,
      completed: false,
      currentNode: undefined
    } as WorkflowState;
    this.visited = new Set();
    this.currentNode = this.findStartNode();
  }

  private findStartNode(): Node | null {
    return this.graph.nodes.find(node => !this.graph.edges.some(edge => edge.to === node.id)) || null;
  }

  private getNextNodes(currentId: string): Node[] {
    const outgoingEdges = this.graph.edges.filter(edge => edge.from === currentId);
    return outgoingEdges
      .map(edge => this.graph.nodes.find(node => node.id === edge.to))
      .filter((node): node is Node => node !== undefined);
  }

  private async shouldExecuteNode(node: Node): Promise<boolean> {
    if (this.visited.has(node.id)) return false;
    if (!node.condition) return true;
    return node.condition(this.state.context);
  }

  private async executeNode(node: Node): Promise<void> {
    try {
      const agent = node.agent as BaseAgent;
      const result = await agent.execute(this.state.context);
      
      // Update context with results
      this.state.context = {
        ...this.state.context,
        toolResults: {
          ...this.state.context.toolResults,
          [node.id]: result
        }
      };
      
      this.visited.add(node.id);
    } catch (error) {
      logger.error('Node execution failed', {
        node: node.id,
        error: error instanceof Error ? error.message : String(error)
      });

      this.state.error = error as Error;
      this.emit('error', error);
      throw error;
    }
  }

  public async execute(): Promise<AgentContext> {
    try {
      while (!this.state.completed && this.currentNode) {
        if (await this.shouldExecuteNode(this.currentNode)) {
          await this.executeNode(this.currentNode);
        }

        // Find next unvisited node that meets its condition
        const nextNodes = this.getNextNodes(this.currentNode.id);
        const nextNode = await this.findNextExecutableNode(nextNodes);
        
        if (!nextNode) {
          this.state.completed = true;
          break;
        }

        this.currentNode = nextNode;
        this.state.currentNode = nextNode.id;
      }

      this.emit('complete', this.state.context);
      return this.state.context;
    } catch (error) {
      logger.error('Workflow execution failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async findNextExecutableNode(nodes: Node[]): Promise<Node | null> {
    for (const node of nodes) {
      if (await this.shouldExecuteNode(node)) {
        return node;
      }
    }
    return null;
  }

  public getCurrentNode(): Node | null {
    return this.currentNode;
  }

  public getState(): WorkflowState {
    return this.state;
  }

  public getContext(): AgentContext {
    return this.state.context;
  }
} 
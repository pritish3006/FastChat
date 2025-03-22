/**
 * Workflow Types
 * 
 * This module defines the types for the workflow manager and nodes.
 * It includes the WorkflowNode interface for defining nodes in the workflow graph.
 */

import { AgentContext, AgentExecutor } from '../base/types';

export interface WorkflowNode {
  id: string;
  executor: AgentExecutor;
  condition?: (context: AgentContext) => Promise<boolean> | boolean;
} 
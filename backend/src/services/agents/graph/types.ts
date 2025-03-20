import { AgentContext, AgentExecutor } from '../base/types';

export interface WorkflowNode {
  id: string;
  executor: AgentExecutor;
  condition?: (context: AgentContext) => Promise<boolean> | boolean;
} 
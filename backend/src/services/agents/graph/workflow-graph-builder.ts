/**
 * Workflow Graph Builder
 * 
 * This module builds the workflow graph for the agentic system.
 * It includes methods to add nodes, edges, and execute the workflow from a starting node.
 */

import { AgentContext, AgentExecutor, Graph } from "../base/types";
import { WorkflowManager, WorkflowEvents } from "./workflow-manager";
import { WorkflowNode } from "./types";
import { QueryAgent } from "../query-agent";
import { SearchAgent } from "../search-agent";
import { VoiceAgent } from "../voice-agent";
import { SummaryAgent } from "../summary-agent";
import { ResponseAgent } from "../response-agent";
import { SpeechAgent } from "../speech-agent";
import { config } from "../../../config";
import logger from "../../../utils/logger";

export interface EdgeDefinition {
    from: string;
    to: string;
    condition?: (context: AgentContext) => boolean | Promise<boolean>;
}

export class WorkflowGraphBuilder {
    private nodes: Map<string, WorkflowNode>;
    private edges: EdgeDefinition[];
    private config: any;
    
    constructor(modelConfig: any = {}) {
        this.nodes = new Map();
        this.edges = [];
        this.config = modelConfig;
        logger.debug("initialzed workflow graph builder");
    }

    /**
     * add the query agent as the entry point of the workflow
     */
    public withQueryAgent(): WorkflowGraphBuilder {
        const queryAgent = new QueryAgent({
            config: {
                name: "query-agent",
                description: "analyzes user query to determine best approach and tools needed",
                model: this.config.defaultModel || config.llm.defaultModel,
                temperature: 0.3
            }
        });

        this.nodes.set('query', {
            id: "query",
            executor: queryAgent
        });
        return this;
    }

    /**
     * add the search agent to the workflow
     */
    public withSearchAgent(condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        const searchAgent = new SearchAgent({
            config: {
                name: "search-agent",
                description: "peforms web searches for the current query using the tavily search api",
                model: this.config.defaultModel || config.llm.defaultModel
            }
        });
        
        this.nodes.set("search", {
            id: "search",
            executor: searchAgent,
            condition
        });
        return this;
    }

    /**
     * add the voice agent to the workflow
     */
    public withVoiceAgent(condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        const voiceAgent = new VoiceAgent({
            config: {
                name: "voice-agent",
                description: "handles voice input and output, converting between text and speech",
                model: this.config.defaultModel || config.llm.defaultModel
            }
        });

        this.nodes.set("voice", {
            id: "voice",
            executor: voiceAgent,
            condition
        });
        return this;
    }

    /**
     * add the summary agent to the workflow
     */
    public withSummaryAgent(condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        const summaryAgent = new SummaryAgent({
            config: {
                name: "summary-agent",
                description: "summarizes content based on mode (currently: search, chat, voice)",
                model: this.config.defaultModel || config.llm.defaultModel,
                temperature: 0.6   
            }
        });

        this.nodes.set("summary", {
            id: "summary",
            executor: summaryAgent,
            condition
        });
        return this;
    }

    /**
     * add the response agent as the final node of the workflow
     */
    public withResponseAgent(condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        const responseAgent = new ResponseAgent({
            config: {
                name: "response-agent", 
                description: "formats and delivers the final response to the user",
                model: this.config.defaultModel || config.llm.defaultModel,
                temperature: 0.7
            }
        });

        this.nodes.set("response", {
            id: "response",
            executor: responseAgent,
        });
        return this;
    }

    /**
     * add the speech agent to the workflow for text-to-speech conversion
     */
    public withSpeechAgent(condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        const speechAgent = new SpeechAgent({
            config: {
                name: "speech-agent",
                description: "converts text responses to speech audio",
                model: "tts-1",
                temperature: 0.5
            }
        });

        this.nodes.set("speech", {
            id: "speech",
            executor: speechAgent,
            condition
        });
        return this;
    }

    /**
     * for adding a custom agent to the workflow
     */
    public withAgent(id: string, agent: AgentExecutor, condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        this.nodes.set(id, {
            id,
            executor: agent,
            condition
        });
        return this;       
    }

    /**
     * connect two nodes with an optional condition
     */
    public connect(from: string, to: string, condition?: (context: AgentContext) => boolean | Promise<boolean>): WorkflowGraphBuilder {
        if (!this.nodes.has(from) || !this.nodes.has(to)) {
            throw new Error('cannot create edge - source or taget node does not exist');
        }
        this.edges.push({
            from,
            to,
            condition
        });
        return this;
    }

    /**
     * add standard connections 
     */
    public connectStandard(): WorkflowGraphBuilder {
        // query -> all other nodes
        for (const nodeId of this.nodes.keys()) {
            if (nodeId != 'query') {
                this.edges.push({from: "query", to: nodeId});
            }
        }

        // connect search to summary
        for (const nodeId of this.nodes.keys()) {
            if (this.nodes.has('search') && this.nodes.has('summary')) {
                this.edges.push({from: 'search', to: 'summary'});
            }
        }

        // connect everything to response
        for (const nodeId of this.nodes.keys()) {
            if (nodeId != 'response') {
                this.edges.push({from: nodeId, to: 'response'});
            }
        }
            
        return this;
    }

    /**
     * builds the workflow graph and returns a manager
     */
    public build(initialContext: AgentContext, events?: WorkflowEvents): WorkflowManager {
        if (!this.nodes.has('query')) {
            logger.warn("building workflow without query agent - this is not recommended");
        }
        if (!this.nodes.has('response')) {
            logger.warn("building workflow without response agent - this is not recommended");
        }

        const graph: Graph = {
            nodes: Array.from(this.nodes.values()).map(node => ({
                id: node.id,
                agent: node.executor, 
                condition: node.condition
            })),
            edges: this.edges
        };

        logger.info("building workflow graph", {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length
        });

        return new WorkflowManager(graph, initialContext, events);
    }
}




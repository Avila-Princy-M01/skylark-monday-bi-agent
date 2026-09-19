export interface AgentBudgetConfig {
  maxSupervisorSteps: number;
  maxAnalystToolCalls: number;
  maxCriticRevisions: number;
  maxWallClockSeconds: number;
}

export const DEFAULT_BUDGET_CONFIG: AgentBudgetConfig = {
  maxSupervisorSteps: 5,
  maxAnalystToolCalls: 8,
  maxCriticRevisions: 2,
  maxWallClockSeconds: 45, // Generous budget for multi-agent LLM roundtrips
};

export class BudgetTracker {
  private startTime: number;
  private analystToolCalls = 0;
  private criticRevisions = 0;
  private supervisorSteps = 0;

  constructor(private config: AgentBudgetConfig = DEFAULT_BUDGET_CONFIG) {
    this.startTime = Date.now();
  }

  public recordSupervisorStep(): boolean {
    this.supervisorSteps++;
    return this.supervisorSteps <= this.config.maxSupervisorSteps && !this.isTimeExceeded();
  }

  public recordAnalystToolCall(): boolean {
    this.analystToolCalls++;
    return this.analystToolCalls <= this.config.maxAnalystToolCalls && !this.isTimeExceeded();
  }

  public recordCriticRevision(): boolean {
    this.criticRevisions++;
    return this.criticRevisions <= this.config.maxCriticRevisions && !this.isTimeExceeded();
  }

  public isTimeExceeded(): boolean {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return elapsedSeconds >= this.config.maxWallClockSeconds;
  }

  public getElapsedSeconds(): number {
    return Math.round(((Date.now() - this.startTime) / 1000) * 10) / 10;
  }

  public getStatus() {
    return {
      supervisorSteps: this.supervisorSteps,
      analystToolCalls: this.analystToolCalls,
      criticRevisions: this.criticRevisions,
      elapsedSeconds: this.getElapsedSeconds(),
      isBudgetExhausted:
        this.supervisorSteps > this.config.maxSupervisorSteps ||
        this.analystToolCalls > this.config.maxAnalystToolCalls ||
        this.criticRevisions > this.config.maxCriticRevisions ||
        this.isTimeExceeded(),
    };
  }
}

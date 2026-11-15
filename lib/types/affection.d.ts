/** Affection system: durable score state + master-only floating window.
 *
 * The model books every change through the qq_set_affection tool; the state
 * lives in <dshHome>/affection.json and is served as a live dashboard on
 * 127.0.0.1:<port> (loopback-only, token-gated) for 主人's floating window.
 */
export interface AffectionEvent {
    time: number;
    delta: number;
    reason: string;
}
export interface StageChange {
    time: number;
    from: string;
    to: string;
    event: string;
}
export interface AffectionState {
    /** Dynamic 0-100; rises and falls with interactions. */
    score: number;
    /** Fixed-ladder stage; only ascends via special events she confirms. */
    stage: string;
    events: AffectionEvent[];
    stageHistory: StageChange[];
    /** 满百阶段宣言提示已给过（一次性） */
    stageNudged?: boolean;
}
/** Stages are HERS: she defines the ladder from her own memory via qq_set_stage.
 * The system only records what she declares — ascents, descents, renames, all real. */
export declare class AffectionStore {
    private readonly log;
    readonly maxScore: number | null;
    private state;
    private readonly file;
    private readonly token;
    private workspacePath;
    private onSubmit;
    constructor(dshHome: string, log: (line: string) => void, maxScore?: number | null);
    /** Persona display names for the dashboard. */
    private persona;
    /** Wire the master-only task injection and the workspace the diaries live in. */
    configure(opts: {
        workspacePath?: string | null;
        onSubmit?: (prompt: string) => void;
        selfName?: string;
        masterName?: string;
    }): void;
    load(): Promise<void>;
    save(): Promise<void>;
    /** Book one score change (rises AND falls); stage is never touched here. */
    book(delta: number, reason: string): Promise<AffectionState>;
    /** 满百阶段宣言提示（2026-11-16 owner 令）：score>=100 且还没提示过 → true，只提示一次。 */
    shouldNudgeStage(): boolean;
    markStageNudged(): void;
    snapshot(): {
        score: number;
        stage: string;
        stageNudged?: boolean;
    };
    /** Set the stage to whatever she declares — from her memory, her truth.
     * Ascents, descents, renames: all recorded honestly in stageHistory. */
    setStage(stage: string, event: string): Promise<{
        ok: boolean;
        note: string;
        state: AffectionState;
    }>;
    /** Diary list or one diary file from workspace memory/. */
    private serveDiary;
    /** Trace: the outbound message log (what she sent, what it quoted). */
    private serveTrace;
    get customHtmlPath(): string;
    writeCustomHtml(html: string): Promise<void>;
    get tokenValue(): string;
    /** Master-only floating dashboard on loopback. */
    serve(port: number, opts?: {
        workspacePath?: string | null;
        onSubmit?: (prompt: string) => void;
    }): void;
}

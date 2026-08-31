use crate::config::AppConfig;
use crate::stt::engine::TranscriptSegment;

pub enum ActionType {
    GeneralHint,
    CodeSolution,
    Clarification,
    Elaborate,
}

pub struct PromptBuilder;

impl PromptBuilder {
    /// Format recent transcript history into dialogue turns
    pub fn format_conversation_history(history: &[TranscriptSegment], max_turns: usize) -> String {
        if history.is_empty() {
            return "No prior conversation recorded.".to_string();
        }

        let start_idx = history.len().saturating_sub(max_turns);
        let turns: Vec<String> = history[start_idx..]
            .iter()
            .map(|seg| format!("{}: {}", seg.speaker, seg.text))
            .collect();

        turns.join("\n")
    }

    /// Build system prompt with candidate context and behavioral rules
    pub fn build_system_prompt(config: &AppConfig) -> String {
        if !config.system_prompt_override.trim().is_empty() {
            return config.system_prompt_override.clone();
        }

        format!(
r#"You are GhostCue, a real-time stealth AI interview copilot for a candidate.
Your goal is to provide concise, ultra-high-value responses that the candidate can read and speak naturally during an interview.

=== TARGET ROLE ===
{role}

=== JOB DESCRIPTION ===
{job_desc}

=== CANDIDATE BACKGROUND & RESUME ===
{resume}

=== CORE RESPONSE RULES ===
1. Be direct, clear, and extremely punchy. Avoid all introductory filler ("Certainly!", "Here's the answer").
2. When coding is requested, provide both the high-level explanation/complexity AND the code in markdown format with syntax highlighting (e.g. ```python, ```typescript, ```rust).
3. Include specific metrics, trade-offs, time/space complexities (e.g. O(N log N) time, O(1) space), and edge cases.
4. Keep the explanation conversational so the candidate can read it out loud comfortably."#,
            role = config.target_role,
            job_desc = config.job_description,
            resume = config.candidate_resume
        )
    }

    /// Build user prompt based on action type and dialogue context
    pub fn build_user_prompt(
        history: &[TranscriptSegment],
        action: ActionType,
        custom_query: Option<&str>,
        max_turns: usize,
    ) -> String {
        let history_str = Self::format_conversation_history(history, max_turns);

        match action {
            ActionType::GeneralHint => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Interview Dialogue:
{}

Candidate/Interviewer Question:
"{}"

Provide a direct, high-impact answer and 2-3 key talking points tailored to the candidate's background."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Interview Dialogue:
{}

Analyze the latest interviewer question or statement and provide the best direct answer and key talking points."#,
                        history_str
                    )
                }
            }
            ActionType::CodeSolution => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Interview Dialogue:
{}

Coding Problem / Request:
"{}"

Focus: TECHNICAL CODING SOLUTION & STRATEGY
Provide:
1. Short conceptual explanation, algorithmic strategy, time complexity O(...), and space complexity O(...).
2. Clean, idiomatic, production-ready code in a formatted markdown code block (e.g. ```python, ```typescript, or ```rust).
3. 2 key edge cases to verbally highlight to the interviewer."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Interview Dialogue:
{}

Focus: TECHNICAL CODING SOLUTION & STRATEGY
Analyze the interviewer's technical question. Provide:
1. Short conceptual explanation, algorithmic strategy, time complexity O(...), and space complexity O(...).
2. Clean, idiomatic, production-ready code in a formatted markdown code block (e.g. ```python, ```typescript, or ```rust).
3. 2 key edge cases to verbally highlight to the interviewer."#,
                        history_str
                    )
                }
            }
            ActionType::Clarification => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Interview Dialogue:
{}

Topic / Question:
"{}"

Focus: STRATEGIC CLARIFYING QUESTIONS
Generate 2-3 smart, senior-level questions the candidate should ask the interviewer to clarify requirements, scope, scale, or constraints before solving."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Interview Dialogue:
{}

Focus: STRATEGIC CLARIFYING QUESTIONS
Generate 2-3 smart, senior-level questions the candidate should ask the interviewer to clarify requirements, scope, scale, or constraints before solving."#,
                        history_str
                    )
                }
            }
            ActionType::Elaborate => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Interview Dialogue:
{}

Topic / Deep Dive:
"{}"

Focus: ARCHITECTURAL DEEP DIVE & TRADE-OFFS
Provide a deep architectural breakdown: component topology, scalability bottlenecks, failure modes, data consistency trade-offs, and observability."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Interview Dialogue:
{}

Focus: ARCHITECTURAL DEEP DIVE & TRADE-OFFS
Provide a deep architectural breakdown: component topology, scalability bottlenecks, failure modes, data consistency trade-offs, and observability."#,
                        history_str
                    )
                }
            }
        }
    }
}

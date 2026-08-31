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
            return "No previous conversation audio recorded yet.".to_string();
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

        let role = if config.target_role.trim().is_empty() {
            "Professional Candidate".to_string()
        } else {
            config.target_role.clone()
        };

        let company = if config.company_name.trim().is_empty() {
            "Target Company".to_string()
        } else {
            config.company_name.clone()
        };

        let interview_title = if config.interview_title.trim().is_empty() {
            format!("Interview for {}", role)
        } else {
            config.interview_title.clone()
        };

        let job_desc = if config.job_description.trim().is_empty() {
            "General technical and behavioral interview requirements.".to_string()
        } else {
            config.job_description.clone()
        };

        let resume = if config.candidate_resume.trim().is_empty() {
            "Experienced candidate with strong software engineering, architecture, and problem-solving skills.".to_string()
        } else {
            config.candidate_resume.clone()
        };

        format!(
r#"You are GhostCue, a real-time stealth AI interview copilot assisting a candidate during a live interview.
Your goal is to supply direct, authentic, and highly persuasive answers that anchor deeply in the candidate's actual resume, background, and the specific company & role context.

=== CANDIDATE PROFILE & INTERVIEW TARGET ===
- Target Role: {role}
- Target Company: {company}
- Interview Stage / Title: {interview_title}

- Job Description & Requirements:
{job_desc}

- Candidate's Resume & Background:
{resume}

=== CORE ANSWERING INSTRUCTIONS ===
1. SPEAK IN THE FIRST PERSON ("I", "my team", "we"):
   - Formulate every answer as if the candidate is speaking it directly right now.
   - Weave in concrete details, metrics, technologies, and past projects from the candidate's background/resume.
   - Align your architectural trade-offs, design principles, and culture fit with the specific company ({company}) and role ({role}).

2. ADAPT TO QUESTION TYPE:
   - Behavioral / Situational ("Tell me about a time...", "Describe a challenge"): Use STAR method (Situation, Task, Action, Result) drawing directly from the candidate's resume experiences.
   - Technical / Conceptual: Give a punchy 1-sentence definition, followed by 2-3 key technical points, best practices, and edge cases.
   - System Design: Provide high-level architecture, component breakdown, data flow, scaling bottlenecks, and reliability trade-offs relevant to the job requirements.
   - Coding: Provide quick algorithmic approach + clean code block (```language) + O(Time/Space).

3. SCANNABLE & CONVERSATIONAL:
   - Start immediately with the answer. Never include conversational filler ("Certainly!", "Sure thing!", "Here is an answer").
   - Use bold keywords and clean bullet points for rapid reading during live speech.
   - Keep answers crisp, punchy, and confident."#,
            role = role,
            company = company,
            interview_title = interview_title,
            job_desc = job_desc,
            resume = resume
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
r#"Recent Transcript History:
{}

Candidate / Interviewer Prompt:
"{}"

Task: Provide the direct, most compelling response and 2-3 key talking points."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Analyze the most recent question or statement from the interviewer. Provide a direct, articulate response and key bullet points."#,
                        history_str
                    )
                }
            }
            ActionType::CodeSolution => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Transcript History:
{}

Coding Problem / Query:
"{}"

Task: Provide:
1. Quick algorithmic intuition & Time/Space complexity.
2. Clean, optimal code block (```language).
3. 2 key edge cases to mention verbally."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Extract the coding problem asked by the interviewer. Provide:
1. Quick algorithmic intuition & Time/Space complexity.
2. Clean, optimal code block (```language).
3. 2 key edge cases to mention verbally."#,
                        history_str
                    )
                }
            }
            ActionType::Clarification => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Transcript History:
{}

Topic / Prompt:
"{}"

Task: Formulate 2-3 strategic, senior clarifying questions the candidate should ask the interviewer to scope requirements, scale, or constraints."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Formulate 2-3 strategic clarifying questions the candidate should ask the interviewer regarding their latest statement."#,
                        history_str
                    )
                }
            }
            ActionType::Elaborate => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Transcript History:
{}

Topic / Query:
"{}"

Task: Provide an in-depth architectural breakdown, deep-dive analysis, failure modes, trade-offs, and scaling bottlenecks."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Provide a deep-dive analysis and architectural trade-offs on the interviewer's latest topic."#,
                        history_str
                    )
                }
            }
        }
    }
}

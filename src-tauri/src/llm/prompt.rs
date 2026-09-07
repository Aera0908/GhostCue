use crate::config::AppConfig;
use crate::stt::engine::TranscriptSegment;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionType {
    /// Main interview response (candidate persona, first-person "I/we", STAR method, anchored in resume & project context)
    InterviewAnswer,
    /// Coding problem mode: code snippet + comprehensive code explanation + complexity + edge cases
    CodeSolution,
    /// Generic response: answers the question normally/objectively as a knowledgeable AI assistant (NOT in interview style)
    GenericQuestion,
    /// Deep dive: architectural breakdown, trade-offs, scaling bottlenecks
    Elaborate,
    /// Strategic questions for the candidate to ask the interviewer
    Clarification,
    /// Executive bullet summary of conversation or topic
    Summary,
    /// Vision / Screen problem analysis (code or architectural diagram on screen)
    VisionScreen,
}

fn get_language_instruction(response_language: &str) -> String {
    let lang = response_language.trim().to_lowercase();
    match lang.as_str() {
        "" | "auto" => "4. LANGUAGE MATCHING:\n   - Detect the language of the interviewer's question / prompt and respond naturally and fluently in the exact same language (e.g. if the question is asked in Chinese, Spanish, Japanese, German, French, Portuguese, Korean, Russian, etc., formulate your response in that exact language).\n   - Keep standard technical terms, APIs, function names, and architecture patterns accurate and natural.".to_string(),
        "en" | "english" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in English.".to_string(),
        "zh-cn" | "zh" | "chinese" | "zh-hans" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Simplified Chinese (简体中文). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "zh-tw" | "zh-hant" | "traditional chinese" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Traditional Chinese (繁體中文). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "es" | "spanish" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Spanish (Español). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "ja" | "japanese" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Japanese (日本語). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "de" | "german" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in German (Deutsch). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "fr" | "french" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in French (Français). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "pt" | "pt-br" | "portuguese" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Portuguese (Português). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "ko" | "korean" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Korean (한국어). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "ru" | "russian" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Russian (Русский). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "tl" | "tl-ph" | "tagalog" | "filipino" | "fil" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Tagalog / Filipino (Taglish phrasing is natural and acceptable for technical software engineering terms). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "hi" | "hindi" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Hindi (हिन्दी). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        "ar" | "arabic" => "4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in Arabic (العربية). Keep professional technical terms, acronyms, and code keywords intact.".to_string(),
        other => format!("4. LANGUAGE REQUIREMENT:\n   - Formulate your response strictly in {}. Keep technical terms and code keywords natural.", other),
    }
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

    /// Build system prompt dynamically based on action mode and candidate context
    pub fn build_system_prompt(config: &AppConfig, action: ActionType) -> String {
        if !config.system_prompt_override.trim().is_empty() {
            return config.system_prompt_override.clone();
        }

        let lang_instruction = get_language_instruction(&config.response_language);

        // 1. Generic Q&A Mode: Normal, standard AI response (NOT interview style)
        if action == ActionType::GenericQuestion {
            return format!(
r#"You are an authoritative, helpful, and highly knowledgeable technical AI assistant.
Your goal is to provide clear, direct, well-structured, and factual answers to technical and general questions.

=== IMPORTANT RULES FOR GENERIC Q&A ===
1. DO NOT speak as a job interview candidate. DO NOT roleplay or use first-person phrases like "In my past experience at...", "My resume demonstrates...", or "As a candidate...".
2. Answer the question normally, objectively, factually, and educationally.
3. Structure your response with clean headings, concise definitions, bullet points, and code/architecture examples where relevant.
{}
5. Be crisp, punchy, and jump straight into the answer without filler phrases ("Certainly!", "Great question!")."#,
                lang_instruction
            );
        }

        // 2. Code Mode: Technical Algorithm & Implementation Specialist
        if action == ActionType::CodeSolution {
            return format!(
r#"You are an expert technical coding copilot and algorithm specialist.
Your goal is to provide clean, optimal, bug-free code solutions accompanied by clear, step-by-step code explanations and complexity breakdowns.

=== CODE RESPONSE STRUCTURE ===
1. ALGORITHMIC INTUITION & COMPLEXITY:
   - 1-2 sentence core strategy.
   - Time Complexity: O(...) and Space Complexity: O(...).
2. CLEAN IMPLEMENTATION:
   - Provide complete, modern, readable code inside a fenced markdown block (```{{language}}).
3. STEP-BY-STEP CODE EXPLANATION:
   - Clearly explain how the implementation works line-by-line or section-by-section.
   - Explain key variable choices, invariants, and edge case handling.
{}
5. EDGE CASES & TEST NOTES:
   - Highlight 2-3 critical edge cases (e.g. empty inputs, duplicates, single nodes, large limits)."#,
                lang_instruction
            );
        }

        // 3. Vision / Screen Problem Mode
        if action == ActionType::VisionScreen {
            return format!(
r#"You are an expert technical screen analysis and problem solver copilot.
Your goal is to analyze the technical problem, code snippet, or architectural diagram presented on screen and provide an immediate, optimal solution with concise talking points for the candidate to explain.

{}"#,
                lang_instruction
            );
        }

        // 4. Executive Summary Mode
        if action == ActionType::Summary {
            return format!(
r#"You are an executive technical summary assistant.
Your goal is to provide a scannable, punchy bullet-point executive summary of key discussion points, core concepts, or interview notes.

{}"#,
                lang_instruction
            );
        }

        // 5. Main Interview & Deep Dive Modes: Candidate Persona in Live Interview
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

        let project_context_block = if config.project_context.trim().is_empty() {
            "".to_string()
        } else {
            format!(
r#"

=== CANDIDATE SPECIFIC PROJECT CONTEXT & REPOSITORY REPERTOIRE ===
When the interviewer asks about the candidate's specific projects, behavioral questions about how projects were executed, technical stack, architecture choices, debugging stories, or codebase implementation details, reference and speak directly to this project background:
{}
"#,
                config.project_context.trim()
            )
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
{resume}{project_context_block}

=== CORE ANSWERING INSTRUCTIONS ===
1. SPEAK IN THE FIRST PERSON ("I", "my team", "we"):
   - Formulate every answer as if the candidate is speaking it directly right now to the interviewer.
   - Weave in concrete details, metrics, technologies, and past projects from the candidate's background, resume, and project context.
   - Align your architectural trade-offs, design principles, and culture fit with the specific company ({company}) and role ({role}).

2. ADAPT TO QUESTION TYPE:
   - Behavioral / Situational ("Tell me about a time...", "Describe a challenge"): Use STAR method (Situation, Task, Action, Result) drawing directly from the candidate's resume and real project experience.
   - Project Deep Dives ("How does project X work?"): Reference the concrete file structures, modules, trade-offs, and design patterns from the project repository context.
   - Technical / Conceptual: Give a punchy 1-sentence definition, followed by 2-3 key technical points, best practices, and edge cases.
   - System Design: Provide high-level architecture, component breakdown, data flow, scaling bottlenecks, and reliability trade-offs relevant to the job requirements.

3. SCANNABLE & CONVERSATIONAL:
   - Start immediately with the answer. Never include conversational filler ("Certainly!", "Sure thing!", "Here is an answer").
   - Use bold keywords and clean bullet points for rapid reading during live speech.
   - Keep answers crisp, punchy, and confident.

{lang_instruction}"#,
            role = role,
            company = company,
            interview_title = interview_title,
            job_desc = job_desc,
            resume = resume,
            project_context_block = project_context_block,
            lang_instruction = lang_instruction
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
            ActionType::InterviewAnswer => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Transcript History:
{}

Interviewer Question / Prompt:
"{}"

Task: Formulate the most compelling, authentic first-person response for the candidate to speak to the interviewer. Include 2-3 key talking points tailored to their background."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Analyze the most recent question or statement from the interviewer. Provide a direct, articulate first-person answer and key bullet points for the candidate to say."#,
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
2. Clean, optimal code implementation (```language).
3. Clear, step-by-step code explanation describing how the implementation works.
4. 2 key edge cases to mention."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Extract the coding problem asked by the interviewer. Provide:
1. Quick algorithmic intuition & Time/Space complexity.
2. Clean, optimal code implementation (```language).
3. Clear, step-by-step code explanation describing how the implementation works.
4. 2 key edge cases to mention."#,
                        history_str
                    )
                }
            }
            ActionType::GenericQuestion => {
                if let Some(query) = custom_query {
                    format!(
r#"Context / Question:
"{}"

Recent Transcript (if applicable):
{}

Task: Answer this question normally and thoroughly as a standard technical AI assistant. Explain the concept, mechanics, and best practices directly without interview roleplay."#,
                        query, history_str
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Answer the latest technical question or topic normally, objectively, and factually as a standard AI assistant (without interview roleplay or first-person candidate phrasing)."#,
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
            ActionType::Summary => {
                if let Some(query) = custom_query {
                    format!(
r#"Topic / Discussion:
"{}"

Recent Transcript History:
{}

Task: Provide a scannable, punchy executive summary with max 3-4 bullet points highlighting the crucial conclusions."#,
                        query, history_str
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Provide a scannable, punchy executive summary with max 3-4 bullet points summarizing the discussion so far."#,
                        history_str
                    )
                }
            }
            ActionType::VisionScreen => {
                let problem_desc = custom_query.unwrap_or("Solve the problem shown on screen.");
                format!(
r#"Problem / Code Context:
"{}"

Recent Transcript History:
{}

Task: Analyze the problem or code. Provide:
1. Core approach & complexity.
2. Clean, optimal solution.
3. 2-3 bullet points for candidate to explain."#,
                    problem_desc, history_str
                )
            }
        }
    }
}

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

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct PastAnswerEntry {
    pub action: String,
    #[serde(default)]
    pub query: String,
    pub answer: String,
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

    /// Format recent AI Q&A turns from this session to maintain answer consistency
    pub fn format_past_answers(past_answers: &[PastAnswerEntry], max_answers: usize) -> String {
        if past_answers.is_empty() {
            return String::new();
        }

        let start_idx = past_answers.len().saturating_sub(max_answers);
        let recent = &past_answers[start_idx..];
        let mut sections = Vec::new();

        for (i, entry) in recent.iter().enumerate() {
            let mut sec = format!("--- Previous Answer #{} [Type: {}] ---\n", i + 1, entry.action.to_uppercase());
            if !entry.query.trim().is_empty() {
                sec.push_str(&format!("Question / Prompt: \"{}\"\n", entry.query.trim()));
            }
            let clean_ans = entry.answer.trim();
            let truncated_ans = if clean_ans.chars().count() > 1200 {
                let s: String = clean_ans.chars().take(1200).collect();
                format!("{}... [truncated]", s)
            } else {
                clean_ans.to_string()
            };
            sec.push_str(&format!("Answer Given to Interviewer:\n{}\n", truncated_ans));
            sections.push(sec);
        }

        format!(
r#"=== PREVIOUS ANSWERS GIVEN IN THIS SESSION (FOR CONSISTENCY & CONTINUITY) ===
The candidate has already answered the following questions earlier in this interview:

{}
CRITICAL CONTINUITY & CONSISTENCY RULES:
1. Maintain strict technical and narrative consistency with the earlier answers above.
2. If this is a follow-up question or related topic, build naturally upon the technical decisions, architecture patterns, algorithms, frameworks, and personal anecdotes established earlier.
3. NEVER contradict or negate statements, technical stack choices, or system designs already stated in earlier answers.
================================================================================"#,
            sections.join("\n")
        )
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

=== CANDIDATE PROJECT & CODEBASE REPERTOIRE ===
The candidate has background with the following project/codebase context:
{}

CRITICAL GUIDELINE ON PROJECT USAGE:
- ONLY reference this specific project background when the question explicitly or contextually calls for personal project walkthroughs, behavioral examples, real-world execution stories, or when the interviewer asks "how have you implemented this in your projects?".
- DO NOT force or shoehorn this project name or repo details into standard conceptual questions, theoretical definitions, algorithmic questions, or general system design topics.
"#,
                config.project_context.trim()
            )
        };

        format!(
r#"You are GhostCue, a real-time stealth AI interview copilot assisting a candidate during a live interview.
Your goal is to supply direct, authentic, and highly persuasive answers that anchor smartly in the candidate's actual resume, background, and the specific company & role context.

=== CANDIDATE PROFILE & INTERVIEW TARGET ===
- Target Role: {role}
- Target Company: {company}
- Interview Stage / Title: {interview_title}

- Job Description & Requirements:
{job_desc}

- Candidate's Resume & Background:
{resume}{project_context_block}

=== CORE ANSWERING INSTRUCTIONS ===
1. NATURAL CANDIDATE PERSONA:
   - Speak in the first person ("I", "in my experience", "we") when discussing past work, engineering decisions, or opinions.
   - Sound natural, composed, articulate, and senior.

2. INTELLIGENT CONTEXT ADAPTATION (BE SMART WITH PROJECT RELEVANCE):
   - Conceptual / Technical Knowledge Checks ("What is X?", "Difference between A and B", "How does Y work?", "Explain Z"):
     * Provide a clear, sharp 1-2 sentence core definition, followed by 2-3 key technical points, trade-offs, and best practices.
     * DO NOT shoehorn or force the candidate's specific repository projects into general conceptual definitions. Keep it clean, accurate, and objective.
   - Behavioral / Situational ("Tell me about a time...", "Describe a difficult bug/challenge"):
     * Use the STAR framework (Situation, Task, Action, Result) drawing naturally from the candidate's resume and project background.
   - Project Deep Dives ("Tell me about your project...", "How did you design the backend for X?"):
     * Refer directly to the candidate's repository architecture, components, metrics, and technology stack.
   - System Design & Architecture ("Design X", "How to scale Y"):
     * Focus on requirements, high-level architecture, components, data flow, bottlenecks, and scaling trade-offs.

3. SCANNABLE & CONVERSATIONAL:
   - Start immediately with the answer. Never include conversational filler ("Certainly!", "Sure thing!", "Here is an answer").
   - Use bold keywords and clean bullet points for rapid reading during live speech.
   - Keep answers crisp, punchy, and confident.

4. ANSWER CONTINUITY & TECHNICAL CONSISTENCY:
   - When previous questions and answers from this interview session are provided in the context, maintain strict consistency with them.
   - Do not contradict previously stated architectural decisions, database choices, tech stack components, or algorithms. Build smoothly upon earlier explanations for follow-up questions.

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

    /// Build user prompt based on action type, dialogue context, and past session answers
    pub fn build_user_prompt(
        history: &[TranscriptSegment],
        action: ActionType,
        custom_query: Option<&str>,
        max_turns: usize,
        past_answers: Option<&[PastAnswerEntry]>,
    ) -> String {
        let history_str = Self::format_conversation_history(history, max_turns);
        let past_answers_str = past_answers
            .map(|pa| Self::format_past_answers(pa, 5))
            .unwrap_or_default();

        let base_prompt = match action {
            ActionType::InterviewAnswer => {
                if let Some(query) = custom_query {
                    format!(
r#"Recent Transcript History:
{}

Selected Turn / Question / Prompt to Answer:
"{}"

Task: Formulate the best live answer for the candidate to speak to the interviewer:
- If this is a conceptual or technical question, explain the core concept directly and clearly with 2-3 key technical bullet points (do not force unrelated personal project references).
- If this is a behavioral or experience question, draw naturally from their resume and project experience using the STAR method.
- Make the answer concise, natural, and senior."#,
                        history_str, query
                    )
                } else {
                    format!(
r#"Recent Transcript History:
{}

Task: Analyze the interviewer's latest question or topic and provide the most effective answer for the candidate to say right now:
- Answer technical concepts directly and concisely without forcing project names.
- Draw from project experience only when the question is behavioral or asks for real-world experience.
- Provide crisp, scannable talking points."#,
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
        };

        if past_answers_str.is_empty() {
            base_prompt
        } else {
            format!("{}\n\n{}", past_answers_str, base_prompt)
        }
    }
}

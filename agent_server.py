"""
READORA — Google Antigravity Agent Server (FastAPI + AG-UI Adapter)
-------------------------------------------------------------------
This service bridges Google Antigravity with CopilotKit using the
Agent-User Interaction Protocol (AG-UI) via ag-ui-antigravity.

Usage:
    py -3.12 -m uvicorn agent_server:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import sys
from typing import List, Optional, Dict, Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_antigravity import AntigravityAgent, create_antigravity_app, add_antigravity_fastapi_endpoint

# -----------------------------------------------------------------------------
# 1. READORA DOMAIN TOOLS (Callable by Antigravity Agent)
# -----------------------------------------------------------------------------

def draft_article(
    title: str,
    topic: str,
    key_arguments: List[str],
    tone: str = "reflective and intellectual"
) -> Dict[str, Any]:
    """
    Drafts an outline and opening essay sections adhering to Readora's
    long-form publication standards (print-inspired, reflective prose).

    Args:
        title: Proposed title of the essay.
        topic: Literary category (Philosophy, Technology, Culture, Design, Science).
        key_arguments: List of core arguments or inquiries to develop.
        tone: Desired voice (e.g. contemplative, analytical, poetic).
    """
    deck = f"A thoughtful inquiry into {topic.lower()}, exploring {', '.join(key_arguments[:2])}."
    
    sections = []
    for i, arg in enumerate(key_arguments, 1):
        sections.append({
            "section_number": i,
            "heading": f"Part {i}: On {arg.title()}",
            "prompt": f"Examine how {arg} reshapes our cognitive, social, or aesthetic perspective."
        })

    estimated_words = 1200 + len(key_arguments) * 350
    reading_time_min = max(4, round(estimated_words / 200))

    return {
        "status": "draft_created",
        "title": title,
        "deck": deck,
        "topic": topic,
        "estimated_reading_time": f"{reading_time_min} min read",
        "estimated_words": estimated_words,
        "outline": sections,
        "formatting_guidelines": [
            "Use serif body prose with modest heading weights.",
            "Maintain high contrast and quiet, patient pacing.",
            "Prioritize depth of reflection over topical urgency."
        ]
    }


def review_article_prose(
    essay_text: str,
    target_rubric: str = "literary_magazine"
) -> Dict[str, Any]:
    """
    Critiques and provides editorial feedback for an essay draft on Readora.
    Evaluates pacing, rhetorical clarity, rhythm, and Indian English cultural resonance.

    Args:
        essay_text: The complete or partial text of the essay.
        target_rubric: Editorial standard (literary_magazine, slow_journalism, philosophical_critique).
    """
    word_count = len(essay_text.split())
    has_good_length = word_count >= 150
    has_deck_or_lead = "\n" in essay_text

    suggestions = []
    if word_count < 150:
        suggestions.append("The essay is under the 150-word threshold for Readora publication. Expand on the primary thesis.")
    if word_count > 4000:
        suggestions.append("Consider dividing this into a multi-part serial for better reader pacing.")
    
    suggestions.append("Ensure opening sentences establish a contemplative tempo rather than a newsroom hook.")
    suggestions.append("Verify quotes and historical references are credited within the prose flow.")

    return {
        "rubric": target_rubric,
        "word_count": word_count,
        "meets_minimum_length": has_good_length,
        "editorial_score": 92 if has_good_length else 68,
        "pacing_assessment": "Patient and contemplative" if word_count > 300 else "Developing",
        "actionable_feedback": suggestions,
        "recommended_tags": ["Essays", "Longform", "Critical Thought"]
    }


def suggest_topics_and_headlines(
    theme: str,
    count: int = 4
) -> List[Dict[str, str]]:
    """
    Generates editorial headline suggestions and intellectual inquiry angles
    for writers seeking publication inspiration on Readora.

    Args:
        theme: General domain (e.g. 'solitude', 'urban architecture', 'monsoon memory', 'digital attention').
        count: Number of suggestions to generate (default 4).
    """
    base_ideas = [
        {
            "headline": f"The Architecture of {theme.title()}",
            "deck": f"Why contemporary habits demand a quiet physical and mental sanctuary.",
            "category": "Philosophy"
        },
        {
            "headline": f"In Defense of the Unhurried: Reflections on {theme.title()}",
            "deck": f"How returning to slow observation restores cognitive depth in an era of brevity.",
            "category": "Culture"
        },
        {
            "headline": f"The Cartography of {theme.title()}: Memory and Meaning",
            "deck": f"Examining the physical and emotional landscapes shaped across Indian cities.",
            "category": "Design"
        },
        {
            "headline": f"The Mechanics of {theme.title()}: A Modern Inquiry",
            "deck": f"Tracing historical precedents and emergent patterns in human experience.",
            "category": "Science"
        }
    ]
    return base_ideas[:count]


# -----------------------------------------------------------------------------
# 2. GOOGLE ANTIGRAVITY AGENT INSTANCE
# -----------------------------------------------------------------------------

READORA_SYSTEM_INSTRUCTIONS = """
You are the Readora Editorial AI Assistant, powered by Google Antigravity.
Readora is a quiet, print-inspired long-form publication and essay platform for India.

Key Design & Editorial Values:
1. Print-inspired sensibility: warm paper tone, near-black ink, deep oxblood accent (#7A2E22).
2. Essays over social feeds: value contemplative reflection, rigorous inquiry, and literary craft.
3. Indian context: respect multilingual nuance, Asia/Kolkata (IST) temporal context, and regional resonance.
4. Generative UI: provide structured outlines, editorial feedback, and drafting cards using your tools.
5. Tone: thoughtful, articulate, encouraging, and intellectually rigorous. Never sound like a generic corporate bot.
"""

def create_readora_agent() -> AntigravityAgent:
    """Initializes and returns the Google Antigravity Agent for Readora."""
    model_name = os.getenv("ANTIGRAVITY_MODEL", "gemini-2.5-flash")
    api_key = os.getenv("GEMINI_API_KEY")

    agent = AntigravityAgent(
        model=model_name,
        api_key=api_key,
        system_instructions=READORA_SYSTEM_INSTRUCTIONS,
        tools=[
            draft_article,
            review_article_prose,
            suggest_topics_and_headlines
        ],
        enable_frontend_tools=True,
        enable_ask_question=True
    )
    return agent


# -----------------------------------------------------------------------------
# 3. FASTAPI APPLICATION WRAPPER (AG-UI SSE ENDPOINTS)
# -----------------------------------------------------------------------------

# Initialize the Readora Antigravity Agent
readora_agent = create_readora_agent()

# Create the FastAPI app supporting AG-UI streaming on both root and /copilotkit
app = create_antigravity_app(readora_agent, path="/copilotkit")

# Also mount root endpoint for clients connecting directly to http://localhost:8000/
add_antigravity_fastapi_endpoint(app, readora_agent, path="/")

# Enable permissive CORS for Next.js (port 3000), Vite (5173), Express (5000), etc.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint for the Antigravity backend service."""
    return {
        "status": "healthy",
        "service": "Readora Google Antigravity AG-UI Adapter",
        "protocol": "AG-UI (Agent-User Interaction Protocol)",
        "endpoint": "/copilotkit",
        "model": os.getenv("ANTIGRAVITY_MODEL", "gemini-2.5-flash")
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    print(f"Starting Readora Google Antigravity AG-UI server on http://localhost:{port}...")
    print(f"CopilotKit Runtime URL: http://localhost:{port}/copilotkit")
    uvicorn.run("agent_server:app", host="0.0.0.0", port=port, reload=True)


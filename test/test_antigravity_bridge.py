"""
READORA — Google Antigravity & CopilotKit AG-UI Bridge Verification Suite
-----------------------------------------------------------------------
Verifies:
1. AntigravityAgent initialization with Readora domain tools.
2. FastAPI app creation via create_antigravity_app.
3. Health check endpoint (GET /health).
4. AG-UI capabilities endpoint (GET /copilotkit/capabilities).
5. Tool execution verification (drafting, review, topic suggestions).
"""

import sys
import os
import unittest
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

class TestAntigravityBridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from agent_server import app, readora_agent, draft_article, review_article_prose, suggest_topics_and_headlines
        cls.app = app
        cls.agent = readora_agent
        cls.client = TestClient(app)
        cls.draft_article = staticmethod(draft_article)
        cls.review_article_prose = staticmethod(review_article_prose)
        cls.suggest_topics_and_headlines = staticmethod(suggest_topics_and_headlines)

    def test_01_agent_configuration(self):
        """Test Antigravity Agent instance has Readora instructions and tools configured."""
        self.assertIsNotNone(self.agent)
        instructions = getattr(self.agent, "_system_instructions", "") or getattr(self.agent, "system_instructions", "")
        self.assertIn("Readora", instructions)
        self.assertIn("print-inspired", instructions)

    def test_02_health_endpoint(self):
        """Test GET /health returns 200 OK and healthy status."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertEqual(data.get("endpoint"), "/copilotkit")
        self.assertEqual(data.get("protocol"), "AG-UI (Agent-User Interaction Protocol)")

    def test_03_copilotkit_capabilities(self):
        """Test GET /copilotkit/capabilities returns valid AG-UI capabilities."""
        res = self.client.get("/copilotkit/capabilities")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("identity", data)
        self.assertEqual(data["identity"].get("type"), "antigravity")
        self.assertTrue(data.get("transport", {}).get("streaming", False))
        self.assertTrue(data.get("tools", {}).get("supported", False))

    def test_04_root_capabilities_mount(self):
        """Test GET /capabilities on root mount also functions."""
        res = self.client.get("/capabilities")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["identity"].get("type"), "antigravity")

    def test_05_draft_article_tool(self):
        """Test draft_article tool generates structured long-form outline for Readora."""
        result = self.draft_article(
            title="In Defense of Slowness",
            topic="Philosophy",
            key_arguments=["Cognitive depth", "Physical sanctuaries"],
            tone="contemplative"
        )
        self.assertEqual(result["status"], "draft_created")
        self.assertEqual(result["title"], "In Defense of Slowness")
        self.assertEqual(result["topic"], "Philosophy")
        self.assertIn("min read", result["estimated_reading_time"])
        self.assertEqual(len(result["outline"]), 2)

    def test_06_review_article_prose_tool(self):
        """Test review_article_prose tool validates word count, pacing, and feedback."""
        sample_prose = (
            "To write an essay is to enter into dialogue with silence. "
            "In our current era, words are produced in torrents, but reflection arrives in drops. "
            "Readora restores the sacred pause between reading and responding."
        )
        review = self.review_article_prose(sample_prose)
        self.assertIn("editorial_score", review)
        self.assertIn("actionable_feedback", review)
        self.assertGreater(len(review["actionable_feedback"]), 0)

    def test_07_suggest_topics_tool(self):
        """Test suggest_topics_and_headlines returns curated editorial angles."""
        topics = self.suggest_topics_and_headlines("monsoon memory", count=3)
        self.assertEqual(len(topics), 3)
        for t in topics:
            self.assertIn("headline", t)
            self.assertIn("deck", t)
            self.assertIn("category", t)


if __name__ == "__main__":
    print("\n=======================================================")
    print("   READORA — GOOGLE ANTIGRAVITY AG-UI TEST SUITE")
    print("=======================================================\n")
    unittest.main(verbosity=2)

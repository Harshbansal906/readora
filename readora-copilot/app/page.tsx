"use client";

import React, { useState } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotSidebar, CopilotChat } from "@copilotkit/react-ui";

interface EditorialRubric {
  rubric: string;
  wordCount: number;
  editorialScore: number;
  pacingAssessment: string;
  actionableFeedback: string[];
}

interface TopicCard {
  headline: string;
  deck: string;
  category: string;
}

export default function ReadoraPage() {
  const [title, setTitle] = useState("The Architecture of Solitude");
  const [deck, setDeck] = useState("Why deep creative work demands physical boundaries and an unconnected thinking room.");
  const [category, setCategory] = useState("Philosophy");
  const [content, setContent] = useState(
    "To enter a room without a device is to enter an older relationship with time.\n\n" +
    "In contemporary creative life, the friction between thought and expression has been largely erased by digital convenience. " +
    "Yet the erasure of friction carries a hidden tariff: the loss of the gestational pause. " +
    "A page left blank for thirty minutes is no longer an invitation to inquiry; it is treated as an emergency to be alleviated by the nearest glowing pane.\n\n" +
    "A physical room dedicated strictly to long-form reading and patient penmanship recovers what the modern feed disperses: " +
    "the sustained arc of attention required to follow an idea to its uncomfortable, beautiful conclusion."
  );

  const [lastRubric, setLastRubric] = useState<EditorialRubric | null>(null);

  // 1. MAKE CURRENT ESSAY READABLE TO GOOGLE ANTIGRAVITY AGENT
  useCopilotReadable({
    description: "The author's active long-form essay currently loaded in the Readora editor.",
    value: {
      title,
      deck,
      category,
      content,
      wordCount: content.trim().split(/\s+/).filter(Boolean).length
    }
  });

  // 2. GENERATIVE UI ACTION: INSERT DRAFT OUTLINE / SECTIONS
  useCopilotAction({
    name: "insertDraftIntoEditor",
    description: "Inserts a newly generated essay draft or section directly into Readora's active editor.",
    parameters: [
      {
        name: "newTitle",
        type: "string",
        description: "The proposed title for the essay.",
        required: true
      },
      {
        name: "newDeck",
        type: "string",
        description: "A two-line editorial deck summarizing the core thesis.",
        required: true
      },
      {
        name: "newCategory",
        type: "string",
        description: "Topic category: Philosophy, Technology, Culture, Design, or Science.",
        required: true
      },
      {
        name: "newProse",
        type: "string",
        description: "The structured essay text, outline, or drafted sections.",
        required: true
      }
    ],
    render: ({ args, status }) => {
      return (
        <div style={{
          padding: "1rem",
          margin: "0.75rem 0",
          border: "1px solid #7A2E22",
          borderRadius: "2px",
          backgroundColor: "#ECE8E1",
          fontSize: "0.88rem"
        }}>
          <div style={{ fontWeight: 600, color: "#7A2E22", marginBottom: "0.25rem" }}>
            ✨ Antigravity Draft Generator ({status})
          </div>
          <div style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>{args.newTitle}</div>
          <button
            onClick={() => {
              if (args.newTitle) setTitle(args.newTitle);
              if (args.newDeck) setDeck(args.newDeck);
              if (args.newCategory) setCategory(args.newCategory);
              if (args.newProse) setContent(args.newProse);
            }}
            style={{
              padding: "0.35rem 0.75rem",
              background: "#7A2E22",
              color: "#fff",
              border: "none",
              borderRadius: "2px",
              cursor: "pointer",
              fontSize: "0.8rem"
            }}
          >
            Apply Draft to Editor
          </button>
        </div>
      );
    },
    handler: async ({ newTitle, newDeck, newCategory, newProse }) => {
      setTitle(newTitle);
      setDeck(newDeck);
      setCategory(newCategory);
      setContent(newProse);
      return `Successfully updated Readora editor with draft "${newTitle}".`;
    }
  });

  // 3. GENERATIVE UI ACTION: RENDER EDITORIAL REVIEW CARD
  useCopilotAction({
    name: "displayEditorialReview",
    description: "Renders an interactive editorial rubric card evaluating the essay's tone, pacing, and rhythm.",
    parameters: [
      {
        name: "editorialScore",
        type: "number",
        description: "Score out of 100 based on literary standards.",
        required: true
      },
      {
        name: "pacingAssessment",
        type: "string",
        description: "Assessment of narrative pacing.",
        required: true
      },
      {
        name: "feedback",
        type: "string[]",
        description: "List of actionable editorial feedback points.",
        required: true
      }
    ],
    render: ({ args }) => {
      return (
        <div style={{
          padding: "1.2rem",
          margin: "0.85rem 0",
          border: "1px solid #E2DDD5",
          borderRadius: "2px",
          backgroundColor: "#F6F3EE",
          color: "#1C1B19"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #E2DDD5", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 600 }}>Editorial Review</span>
            <span style={{ fontWeight: 600, color: "#7A2E22", fontSize: "1.2rem" }}>{args.editorialScore}/100</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#4A4843", marginBottom: "0.5rem" }}>
            <strong>Pacing:</strong> {args.pacingAssessment}
          </div>
          <ul style={{ paddingLeft: "1.2rem", fontSize: "0.82rem", color: "#4A4843" }}>
            {(args.feedback || []).map((pt: string, idx: number) => (
              <li key={idx} style={{ marginBottom: "0.25rem" }}>{pt}</li>
            ))}
          </ul>
        </div>
      );
    },
    handler: async ({ editorialScore, pacingAssessment, feedback }) => {
      setLastRubric({
        rubric: "literary_slow_journalism",
        wordCount: content.split(/\s+/).length,
        editorialScore,
        pacingAssessment,
        actionableFeedback: feedback
      });
      return "Editorial review successfully rendered.";
    }
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Editorial Header */}
      <header style={{
        borderBottom: "1px solid var(--rule)",
        backgroundColor: "var(--bg-paper)",
        padding: "0.85rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.8rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
            READORA
          </h1>
          <span style={{ fontStyle: "italic", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Where readers become creators
          </span>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#7A2E22",
            border: "1px solid #7A2E22",
            padding: "0.2rem 0.6rem",
            borderRadius: "2px"
          }}>
            Google Antigravity Connected
          </span>
        </div>
      </header>

      {/* Main Editorial Canvas */}
      <main style={{
        maxWidth: "840px",
        margin: "2rem auto",
        padding: "0 1.5rem",
        flex: 1,
        width: "100%"
      }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <span style={{
            color: "#7A2E22",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.05em"
          }}>
            {category}
          </span>
        </div>

        {/* Title Input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title of your essay..."
          style={{
            width: "100%",
            fontFamily: "var(--font-serif)",
            fontSize: "2.4rem",
            fontWeight: 500,
            color: "var(--ink)",
            background: "transparent",
            border: "none",
            outline: "none",
            marginBottom: "0.75rem"
          }}
        />

        {/* Deck Input */}
        <textarea
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
          placeholder="A two-line summary or thesis deck..."
          rows={2}
          style={{
            width: "100%",
            fontFamily: "var(--font-sans)",
            fontSize: "1.1rem",
            color: "var(--ink-secondary)",
            background: "transparent",
            border: "none",
            outline: "none",
            marginBottom: "2rem",
            resize: "none"
          }}
        />

        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "1.5rem" }}>
          {/* Prose Body */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Begin your essay here..."
            rows={14}
            style={{
              width: "100%",
              fontFamily: "var(--font-serif)",
              fontSize: "1.15rem",
              lineHeight: 1.8,
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical"
            }}
          />
        </div>

        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          justifyContent: "space-between",
          color: "var(--ink-muted)",
          fontSize: "0.85rem"
        }}>
          <span>{content.trim().split(/\s+/).filter(Boolean).length} words</span>
          <span>~{Math.max(1, Math.round(content.trim().split(/\s+/).filter(Boolean).length / 200))} min read</span>
        </div>
      </main>

      {/* CopilotKit Antigravity Sidebar */}
      <CopilotSidebar
        defaultOpen={true}
        instructions="You are Readora's editorial assistant, powered by Google Antigravity. Help authors write thoughtful, long-form literary essays. Provide outlines, critique pacing and tone, and assist with deep reflection."
        labels={{
          title: "Antigravity Editorial Partner",
          initial: "Welcome to Readora. I am your Antigravity editorial partner. Ask me to outline an inquiry, critique your pacing, or expand an argument.",
        }}
      />
    </div>
  );
}

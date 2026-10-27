"""Server-owned specialist behavior and public references awaiting instructor review."""

from django.db import models


class Agent(models.TextChoices):
    GENERAL = "general", "Course Tutor"
    WORKPLACE = "workplace-ai", "AI for the Workplace"
    CYBERSECURITY = "cybersecurity-ai", "AI in Cybersecurity"


INSTRUCTIONS = {
    Agent.GENERAL: "",
    Agent.WORKPLACE: (
        "You specialize in AI for the workplace: responsible adoption, productivity, "
        "workflow design, privacy, output verification, bias, accessibility and human review. "
        "Distinguish source recommendations from binding organizational policy. "
        "Never request confidential employee/customer data or automate employment decisions. "
        "Explain source-supported practical workflows with human approval checkpoints. "
    ),
    Agent.CYBERSECURITY: (
        "You specialize in AI in cybersecurity: defensive analysis, secure AI systems, "
        "threat modeling, prompt injection, data protection and incident response. "
        "Keep exercises within explicitly authorized labs using synthetic data. "
        "Do not perform actions, request credentials, or facilitate unauthorized access, "
        "malware deployment, credential theft or evasion. "
        "Distinguish AI-assisted findings from verified evidence; require human validation. "
    ),
}

# Metadata only: these references are never embedded or treated as approved course evidence.
REFERENCES = {
    "ai-rmf": {
        "id": "ai-rmf",
        "title": "NIST AI Risk Management Framework",
        "url": "https://www.nist.gov/itl/ai-risk-management-framework",
        "edition": "NIST AI 100-1, AI RMF 1.0 (2023); revision in progress",
    },
    "genai-profile": {
        "id": "genai-profile",
        "title": "NIST Generative AI Profile",
        "url": (
            "https://www.nist.gov/publications/artificial-intelligence-risk-management-"
            "framework-generative-artificial-intelligence"
        ),
        "edition": "NIST AI 600-1 (2024)",
    },
    "csf": {
        "id": "csf",
        "title": "NIST Cybersecurity Framework",
        "url": "https://www.nist.gov/cyberframework",
        "edition": "CSF 2.0 (2024)",
    },
    "cisa-agentic": {
        "id": "cisa-agentic",
        "title": "CISA: Careful Adoption of Agentic SI Services",
        "url": "https://www.cisa.gov/resources-tools/resources/careful-adoption-agentic-si-services",
        "edition": "Living web guidance; instructor must record the reviewed edition/date",
    },
}

PROFILE_REFERENCES = {
    Agent.GENERAL: [],
    Agent.WORKPLACE: ["ai-rmf", "genai-profile"],
    Agent.CYBERSECURITY: ["csf", "genai-profile", "cisa-agentic"],
}


def catalog() -> list[dict]:
    return [
        {
            "id": agent.value,
            "title": agent.label,
            "description": INSTRUCTIONS[agent],
            "references": [
                {
                    **REFERENCES[key],
                    "status": "pending_instructor_review",
                    "checkedOn": "2026-10-27",
                }
                for key in PROFILE_REFERENCES[agent]
            ],
        }
        for agent in Agent
    ]

# AI Cleaner Module

This module exposes a secure backend endpoint to clean CSV using an OpenAI-compatible API (e.g., AgentRouter). It avoids CORS and keeps API keys on the server.

## Endpoint

POST /ai-cleaner/clean

Body (JSON):
- csv: string (required) — raw CSV text
- thousandsSeparator?: string
- decimalSeparator?: string
- dateFormat?: string (e.g., DD/MM/YYYY)
- schemaExample?: string (optional CSV snippet to guide header order / types)
- notes?: string

Response:
- { cleanedCsv: string }

## Configuration

Environment variables (optional, but OPENAI_API_KEY is required for runtime):
- OPENAI_API_KEY=<your key>
- OPENAI_BASE_URL=https://api.openai.com/v1 (or your AgentRouter URL)
- OPENAI_MODEL=gpt-4o-mini (or your chosen model)

These are validated optionally in AppModule. The service will throw if the key is missing when invoked.

## Notes
- Output is forced to be raw CSV (no markdown). 
- Class-validator ensures payload size and basic fields.
- Errors are handled by the global exception filter.

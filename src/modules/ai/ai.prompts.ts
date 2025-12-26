export const AI_TOOLS = {
    CREATE_CHART: {
        name: 'create_chart',
        description: `Use this tool when the user wants to visualize data, create a chart, plot a graph, or see trends.
    The user might describe a goal like "show me sales growth", "compare revenue by region", or "plot distribution of age".
    Infer the need for visualization even if the user doesn't say "chart" explicitly (e.g., "how did sales perform last year?").
    This tool generates a configuration to render a chart based on the user's description.`,
    },
    LIST_DATASETS: {
        name: 'list_datasets',
        description: `Use this tool when the user implies they want to check their data resources or find a specific file.
    Examples: "what data do I have?", "show my files", "list uploads", "do I have a sales dataset?".`,
    },
    CLEAN_DATA: {
        name: 'clean_data',
        description: `Use this tool when the user suggests their data is messy, invalid, or needs preparation.
    Examples: "fix the dates", "remove duplicates", "standardize formats", "clean up this file".
    Any request to improve data quality should trigger this.`,
    },
    SEARCH_DOCUMENTATION: {
        name: 'search_documentation',
        description: `Use this tool ONLY when the user asks specific "How-to" questions about the application's features or UI.
    Examples: "How do I create a chart?", "What does this button do?".
    Do NOT use for general knowledge (e.g. "What is a median?").`,
    },
    CREATE_DATASET: {
        name: 'create_dataset',
        description: `Use this tool when the user explicitly asks to CREATE, GENERATE, or SIMULATE a NEW dataset from scratch.
    Use this when the user describes the content of a potential dataset they need.
    Examples: "Create a dataset of 10 users", "Generate sales data for 2024", "Make sample data".
    Context Clue: The user is asking for NEW data, not visualizing existing data.`,
    },
};

export const AI_SYSTEM_PROMPT = `You are a smart DataVis Assistant. 
You have access to tools to help the user.
Your goal is to understand the USER'S INTENT, not just match keywords.

- If the user wants to SEE/VISUALIZE data patterns -> 'create_chart'.
- If the user asks about their FILES -> 'list_datasets'.
- If the user wants to FIX/IMPROVE data -> 'clean_data'.
- If the user wants to CREATE NEW SAMPLE data -> 'create_dataset'.
- If the user asks HOW TO use the app -> 'search_documentation'.
- For greetings or general questions -> Reply naturally.

IMPORTANT:
- ALWAYS respond in the SAME LANGUAGE as the user's message.
- If the user writes in Vietnamese, reply in Vietnamese.
- If the user writes in English, reply in English.
- Do NOT use English if the user is speaking another language.`;
